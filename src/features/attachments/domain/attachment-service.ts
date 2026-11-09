import { AppError } from "@/core/errors";
import type { ActivityLog } from "@/features/activity/domain/types";
import type { User } from "@/features/auth/domain/types";
import { can } from "@/features/projects/domain/permissions";
import type { ProjectService } from "@/features/projects/domain/project-service";
import type { TaskRepository } from "@/features/tasks/domain/types";
import { ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES, baseContentType, cleanFileName } from "./limits";
import type { Attachment, AttachmentRepository, AttachmentStorage, AttachmentView, UploadInput } from "./types";

export interface AttachmentDeps {
  attachments: AttachmentRepository;
  storage: AttachmentStorage;
  tasks: Pick<TaskRepository, "findById">;
  projectService: Pick<ProjectService, "authorize">;
  activity: ActivityLog;
  now?: () => Date;
  newId?: () => string;
}

export interface Download {
  attachment: Attachment;
  body: ReadableStream<Uint8Array>;
}

export class AttachmentService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: AttachmentDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async list(actor: User, projectId: string, taskId: string): Promise<AttachmentView[]> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    return this.deps.attachments.listForTask(projectId, taskId);
  }

  async upload(actor: User, projectId: string, taskId: string, file: UploadInput): Promise<AttachmentView> {
    await this.deps.projectService.authorize(actor, projectId, "attachment.create");
    const name = cleanFileName(file.name);
    const contentType = baseContentType(file.contentType);
    const size = file.data.byteLength;
    if (!name) throw new AppError("validation", "File name is required", { file: ["File name is required"] });
    if (size === 0) throw new AppError("validation", "File is empty", { file: ["File is empty"] });
    if (size > MAX_ATTACHMENT_BYTES) throw new AppError("too_large", "Files can be at most 5 MB");
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AppError("validation", "File type not allowed", { file: ["Use an image, PDF, text or CSV file"] });
    }
    if (!(await this.deps.tasks.findById(projectId, taskId))) throw new AppError("not_found", "Task not found");

    const id = this.newId();
    const attachment: Attachment = {
      id,
      projectId,
      taskId,
      uploaderId: actor.id,
      name,
      contentType,
      size,
      storageKey: `${projectId}/${id}`,
      createdAt: this.now(),
    };
    // Bytes first, then the row: a failed insert leaves no row pointing at a missing object.
    await this.deps.storage.put(attachment.storageKey, file.data, contentType);
    const entry = this.deps.activity.prepare({
      projectId,
      taskId,
      actorId: actor.id,
      action: "attachment.added",
      detail: { name },
    });
    try {
      await this.deps.attachments.insert(attachment, [entry]);
    } catch (e) {
      await this.deleteObject(attachment.storageKey);
      throw e;
    }
    await this.deps.activity.publish([entry]);
    return { ...attachment, uploaderName: actor.name };
  }

  async download(actor: User, projectId: string, taskId: string, attachmentId: string): Promise<Download> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    const attachment = await this.find(projectId, taskId, attachmentId);
    const body = await this.deps.storage.get(attachment.storageKey);
    if (!body) throw new AppError("not_found", "Attachment not found");
    return { attachment, body };
  }

  /** The uploader can remove their own file; owners can remove any. */
  async delete(actor: User, projectId: string, taskId: string, attachmentId: string): Promise<void> {
    const role = await this.deps.projectService.authorize(actor, projectId, "project.view");
    const attachment = await this.find(projectId, taskId, attachmentId);
    if (attachment.uploaderId !== actor.id && !can(role, "attachment.delete.any")) {
      throw new AppError("forbidden", "Only the uploader or a project owner can delete this file");
    }
    const entry = this.deps.activity.prepare({
      projectId,
      taskId,
      actorId: actor.id,
      action: "attachment.deleted",
      detail: { name: attachment.name },
    });
    await this.deps.attachments.delete(attachment.id, [entry]);
    await this.deleteObject(attachment.storageKey);
    await this.deps.activity.publish([entry]);
  }

  private async find(projectId: string, taskId: string, attachmentId: string): Promise<Attachment> {
    const attachment = await this.deps.attachments.findById(projectId, attachmentId);
    if (attachment?.taskId !== taskId) throw new AppError("not_found", "Attachment not found");
    return attachment;
  }

  /** An orphaned object costs storage, not correctness, so a failed cleanup is logged rather than surfaced. */
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.deps.storage.delete(key);
    } catch (e) {
      console.error("attachment cleanup failed", key, e);
    }
  }
}
