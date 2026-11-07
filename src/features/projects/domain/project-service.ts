import { AppError } from "@/core/errors";
import { parseInput } from "@/core/validation";
import type { User, UserRepository } from "@/features/auth/domain/types";
import { can, type ProjectAction } from "./permissions";
import { addMemberSchema, createProjectSchema, updateProjectSchema } from "./schemas";
import type { Member, Project, ProjectDetail, ProjectRepository, ProjectSummary, Role } from "./types";

export interface ProjectDeps {
  projects: ProjectRepository;
  users: UserRepository;
  now?: () => Date;
  newId?: () => string;
}

export class ProjectService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: ProjectDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Resolves the actor's role and throws if the action is not allowed.
   * Non-members get not_found rather than forbidden, so project ids can't be probed.
   */
  async authorize(actor: User, projectId: string, action: ProjectAction): Promise<Role> {
    const role = await this.deps.projects.getRole(projectId, actor.id);
    if (!role) throw new AppError("not_found", "Project not found");
    if (!can(role, action)) throw new AppError("forbidden", "Only the project owner can do that");
    return role;
  }

  listForUser(actor: User): Promise<ProjectSummary[]> {
    return this.deps.projects.listForUser(actor.id);
  }

  async get(actor: User, projectId: string): Promise<ProjectDetail> {
    const role = await this.authorize(actor, projectId, "project.view");
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new AppError("not_found", "Project not found");
    const members = await this.deps.projects.listMembers(projectId);
    return { ...project, role, members };
  }

  async create(actor: User, input: unknown): Promise<Project> {
    const data = parseInput(createProjectSchema, input);
    const project: Project = { id: this.newId(), ...data, createdAt: this.now() };
    await this.deps.projects.insert(project, actor.id);
    return project;
  }

  async update(actor: User, projectId: string, input: unknown): Promise<void> {
    await this.authorize(actor, projectId, "project.update");
    await this.deps.projects.update(projectId, parseInput(updateProjectSchema, input));
  }

  async delete(actor: User, projectId: string): Promise<void> {
    await this.authorize(actor, projectId, "project.delete");
    await this.deps.projects.delete(projectId);
  }

  async addMember(actor: User, projectId: string, input: unknown): Promise<Member> {
    await this.authorize(actor, projectId, "members.manage");
    const { email } = parseInput(addMemberSchema, input);
    const user = await this.deps.users.findByEmail(email);
    if (!user) throw new AppError("not_found", "No user with that email", { email: ["No user with that email"] });
    if (await this.deps.projects.getRole(projectId, user.id)) {
      throw new AppError("conflict", "Already a member", { email: ["Already a member"] });
    }
    await this.deps.projects.addMember(projectId, user.id, "member");
    return { id: user.id, email: user.email, name: user.name, role: "member" };
  }

  async removeMember(actor: User, projectId: string, userId: string): Promise<void> {
    await this.authorize(actor, projectId, "members.manage");
    const role = await this.deps.projects.getRole(projectId, userId);
    if (!role) throw new AppError("not_found", "Not a member");
    if (role === "owner") throw new AppError("validation", "The owner can't be removed");
    await this.deps.projects.removeMember(projectId, userId);
  }
}
