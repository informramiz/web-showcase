import type { ActivityEntry } from "@/features/activity/domain/types";
export interface Comment {
  id: string;
  projectId: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface CommentView extends Comment {
  authorName: string;
}

export interface CommentRepository {
  /** Stores the comment and its audit entries in one atomic batch. */
  insert(comment: Comment, activity: ActivityEntry[]): Promise<void>;
  listForTask(projectId: string, taskId: string): Promise<CommentView[]>;
}
