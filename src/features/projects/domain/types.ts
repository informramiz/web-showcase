import type { User } from "@/features/auth/domain/types";

export type Role = "owner" | "member";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
}

export interface ProjectSummary extends Project {
  role: Role;
  memberCount: number;
  openTaskCount: number;
}

export interface Member extends User {
  role: Role;
}

export interface ProjectDetail extends Project {
  role: Role;
  members: Member[];
}

export interface ProjectRepository {
  /** Inserts the project with its owner unless the owner already owns `maxOwned` projects; false if refused. */
  insert(project: Project, ownerId: string, maxOwned: number): Promise<boolean>;
  findById(id: string): Promise<Project | null>;
  listForUser(userId: string): Promise<ProjectSummary[]>;
  update(id: string, patch: Partial<Pick<Project, "name" | "description">>): Promise<void>;
  delete(id: string): Promise<void>;
  getRole(projectId: string, userId: string): Promise<Role | null>;
  listMembers(projectId: string): Promise<Member[]>;
  /** Adds the member unless the project already has `maxMembers`; false if refused. Atomic with the count. */
  addMember(projectId: string, userId: string, role: Role, maxMembers: number): Promise<boolean>;
  removeMember(projectId: string, userId: string): Promise<void>;
}
