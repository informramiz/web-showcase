"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { Page, TaskJson } from "../domain/types";
import { tasksApi, type NewTask, type TaskQueryParams, type TaskUpdate } from "./api";
import { taskDetailOptions, taskKeys, taskListOptions } from "./queries";

export function useTasks(projectId: string, q: TaskQueryParams) {
  return useQuery({ ...taskListOptions(projectId, q), placeholderData: keepPreviousData });
}

type Snapshot = [QueryKey, Page<TaskJson> | undefined][];

/**
 * Shared optimistic-update plumbing: cancel in-flight fetches for the project, apply `edit` to every cached
 * page, and hand back a snapshot so a failed request can roll the cache back. Refetch once settled either way.
 */
function useOptimistic<V, R>(
  projectId: string,
  fn: (v: V) => Promise<R>,
  edit: (page: Page<TaskJson>, v: V) => Page<TaskJson>,
) {
  const qc = useQueryClient();
  const key = taskKeys.project(projectId);
  return useMutation<R, Error, V, { snapshot: Snapshot }>({
    mutationFn: fn,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData<Page<TaskJson>>({ queryKey: key });
      qc.setQueriesData<Page<TaskJson>>({ queryKey: key }, (page) => (page ? edit(page, v) : page));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, data]) => qc.setQueryData(k, data)),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: taskKeys.detailRoot(projectId) }),
      ]),
  });
}

export function useUpdateTask(projectId: string) {
  return useOptimistic(
    projectId,
    ({ id, patch }: { id: string; patch: TaskUpdate }) => tasksApi.update(projectId, id, patch),
    (page, { id, patch }) => ({ ...page, items: page.items.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  );
}

export function useDeleteTask(projectId: string) {
  return useOptimistic(
    projectId,
    (id: string) => tasksApi.remove(projectId, id),
    (page, id) => ({ ...page, total: page.total - 1, items: page.items.filter((t) => t.id !== id) }),
  );
}

export function useCreateTask(projectId: string, createdBy: string) {
  return useOptimistic(
    projectId,
    (input: NewTask) => tasksApi.create(projectId, input),
    (page, input) => {
      const now = new Date().toISOString();
      const temp: TaskJson = {
        id: `temp-${now}`,
        projectId,
        title: input.title,
        description: "",
        status: input.status ?? "todo",
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        position: Number.MAX_SAFE_INTEGER,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      return { ...page, total: page.total + 1, items: [...page.items, temp] };
    },
  );
}

export function useTaskDetail(projectId: string, taskId: string) {
  return useQuery(taskDetailOptions(projectId, taskId));
}

export function useAddComment(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => tasksApi.addComment(projectId, taskId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.detail(projectId, taskId) }),
  });
}

/** Upload and delete refresh the detail panel, which lists the files and the activity entries they create. */
export function useUploadAttachment(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => tasksApi.upload(projectId, taskId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.detail(projectId, taskId) }),
  });
}

export function useDeleteAttachment(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => tasksApi.removeAttachment(projectId, taskId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.detail(projectId, taskId) }),
  });
}
