import type { Db } from "@/db/types";
import { AuthService } from "@/features/auth/domain/auth-service";
import { createPbkdf2Hasher } from "@/features/auth/domain/crypto";
import type { PasswordHasher } from "@/features/auth/domain/types";
import { createSessionRepository, createUserRepository } from "@/features/auth/data/drizzle-auth-repositories";
import { ProjectService } from "@/features/projects/domain/project-service";
import { createProjectRepository } from "@/features/projects/data/drizzle-project-repository";
import { TaskService } from "@/features/tasks/domain/task-service";
import { createTaskRepository } from "@/features/tasks/data/drizzle-task-repository";

export interface Container {
  db: Db;
  auth: AuthService;
  projects: ProjectService;
  tasks: TaskService;
}

/** Composition root: the only place that knows which repository implementation backs each service. */
export function createContainer(db: Db, hasher: PasswordHasher = createPbkdf2Hasher()): Container {
  const users = createUserRepository(db);
  const projectRepo = createProjectRepository(db);
  const auth = new AuthService({ users, sessions: createSessionRepository(db), hasher });
  const projects = new ProjectService({ projects: projectRepo, users });
  const tasks = new TaskService({ tasks: createTaskRepository(db), projects: projectRepo, projectService: projects });
  return { db, auth, projects, tasks };
}
