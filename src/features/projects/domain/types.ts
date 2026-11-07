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
  insert(project: Project, ownerId: string): Promise<void>;
  findById(id: string): Promise<Project | null>;
  listForUser(userId: string): Promise<ProjectSummary[]>;
  update(id: string, patch: Partial<Pick<Project, "name" | "description">>): Promise<void>;
  delete(id: string): Promise<void>;
  getRole(projectId: string, userId: string): Promise<Role | null>;
  listMembers(projectId: string): Promise<Member[]>;
  addMember(projectId: string, userId: string, role: Role): Promise<void>;
  removeMember(projectId: string, userId: string): Promise<void>;
}
