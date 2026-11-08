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
  insert(comment: Comment): Promise<void>;
  listForTask(projectId: string, taskId: string): Promise<CommentView[]>;
}
