import type { Db } from "@/db/types";
import { ActivityService } from "@/features/activity/domain/activity-service";
import { createActivityRepository } from "@/features/activity/data/drizzle-activity-repository";
import { AttachmentService } from "@/features/attachments/domain/attachment-service";
import type { AttachmentStorage } from "@/features/attachments/domain/types";
import { createAttachmentRepository } from "@/features/attachments/data/drizzle-attachment-repository";
import { createMemoryStorage } from "@/features/attachments/data/memory-storage";
import { AuthService } from "@/features/auth/domain/auth-service";
import { createPbkdf2Hasher } from "@/features/auth/domain/crypto";
import type { PasswordHasher } from "@/features/auth/domain/types";
import { createSessionRepository, createUserRepository } from "@/features/auth/data/drizzle-auth-repositories";
import { BillingService } from "@/features/billing/domain/billing-service";
import type { BillingGateway } from "@/features/billing/domain/types";
import { createSubscriptionRepository } from "@/features/billing/data/drizzle-subscription-repository";
import { CommentService } from "@/features/comments/domain/comment-service";
import { createCommentRepository } from "@/features/comments/data/drizzle-comment-repository";
import { ProjectService, revokeQuietly } from "@/features/projects/domain/project-service";
import { createProjectRepository } from "@/features/projects/data/drizzle-project-repository";
import { RealtimeService } from "@/features/realtime/domain/realtime-service";
import { noopEvents, type ProjectEvents, type RealtimeTransport } from "@/features/realtime/domain/types";
import { TaskService } from "@/features/tasks/domain/task-service";
import { createTaskRepository } from "@/features/tasks/data/drizzle-task-repository";

export interface Container {
  auth: AuthService;
  projects: ProjectService;
  tasks: TaskService;
  comments: CommentService;
  activity: ActivityService;
  attachments: AttachmentService;
  realtime: RealtimeService;
  billing: BillingService;
}

/** Adapters that differ between Cloudflare, local dev and tests. Everything else is built from the database. */
export interface ContainerOptions {
  hasher?: PasswordHasher;
  events?: ProjectEvents;
  /** How browsers receive events. Defaults to polling, which needs nothing from the platform. */
  transport?: RealtimeTransport;
  /**
   * File bytes. Undefined means memory, which suits tests; the runtime passes R2 or a local folder. Null turns
   * attachments off (no storage on this deployment), which the API and UI report instead of failing late.
   */
  storage?: AttachmentStorage | null;
  /** Stripe (test mode). Absent means billing is off and no plan limits apply. */
  billing?: BillingGateway;
}

/** Composition root: the only place that knows which implementation backs each port. */
export function createContainer(db: Db, options: ContainerOptions = {}): Container {
  const users = createUserRepository(db);
  const projectRepo = createProjectRepository(db);
  const taskRepo = createTaskRepository(db);
  const events = options.events ?? noopEvents;
  const auth = new AuthService({
    users,
    sessions: createSessionRepository(db),
    hasher: options.hasher ?? createPbkdf2Hasher(),
    // Signing out closes live sockets in every project; reconnecting needs a valid session for a new ticket.
    onLogout: async (userId) => {
      for (const p of await projectRepo.listForUser(userId)) await revokeQuietly(events, p.id, userId);
    },
  });
  const billing = new BillingService({
    subscriptions: createSubscriptionRepository(db),
    gateway: options.billing ?? null,
  });
  const projects = new ProjectService({ projects: projectRepo, users, events, planLimits: billing });
  const activity = new ActivityService({
    activity: createActivityRepository(db),
    projectService: projects,
    events,
  });
  const tasks = new TaskService({ tasks: taskRepo, projects: projectRepo, projectService: projects, activity });
  const comments = new CommentService({
    comments: createCommentRepository(db),
    tasks: taskRepo,
    projectService: projects,
    activity,
  });
  const attachments = new AttachmentService({
    attachments: createAttachmentRepository(db),
    storage: options.storage === undefined ? createMemoryStorage() : options.storage,
    tasks: taskRepo,
    projectService: projects,
    activity,
  });
  const realtime = new RealtimeService({ projectService: projects, transport: options.transport ?? { kind: "poll" } });
  return { auth, projects, tasks, comments, activity, attachments, realtime, billing };
}
