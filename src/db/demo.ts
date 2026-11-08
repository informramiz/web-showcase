import type { Container } from "@/server/container";

export const DEMO_PASSWORD = "demo1234";
const DEMO_USERS = [
  { name: "Dana Demo", email: "demo@teamboard.dev" },
  { name: "Sam Rivera", email: "sam@teamboard.dev" },
  { name: "Lee Chen", email: "lee@teamboard.dev" },
] as const;

type Status = "todo" | "in_progress" | "done";
const WEBSITE_TASKS: [string, Status, number | null, number | null][] = [
  // title, status, assignee index, due in N days
  ["Audit current site analytics", "done", 0, -6],
  ["Pick a headless CMS", "done", 1, -3],
  ["Write content migration plan", "in_progress", 0, 2],
  ["Design new pricing page", "in_progress", 2, 4],
  ["Set up preview deployments", "in_progress", 1, 5],
  ["Draft homepage copy", "todo", 0, 7],
  ["Redirect map for old URLs", "todo", 1, 9],
  ["Cookie banner and consent mode", "todo", null, 10],
  ["Image pipeline (AVIF, sizes)", "todo", 2, 12],
  ["Load test the contact form API", "todo", null, 14],
  ["Accessibility pass on templates", "todo", null, null],
  ["Launch checklist", "todo", 0, 21],
];
const MOBILE_TASKS: [string, Status, number | null, number | null][] = [
  ["Offline sync spike", "in_progress", 1, 3],
  ["Push notification opt-in screen", "todo", 0, 6],
  ["Crash-free rate dashboard", "done", 1, -2],
  ["Release train calendar", "todo", null, 15],
];

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Creates the demo users, projects and tasks through the services, so the data obeys every domain rule. */
export async function seedDemo(c: Container): Promise<number> {
  const users = [];
  for (const u of DEMO_USERS) users.push((await c.auth.register({ ...u, password: DEMO_PASSWORD })).user);
  const [dana, sam, lee] = users as [(typeof users)[0], (typeof users)[0], (typeof users)[0]];

  const website = await c.projects.create(dana, {
    name: "Website relaunch",
    description: "Move the marketing site to a headless CMS and ship the new design.",
  });
  await c.projects.addMember(dana, website.id, { email: sam.email });
  await c.projects.addMember(dana, website.id, { email: lee.email });

  const mobile = await c.projects.create(sam, {
    name: "Mobile app v2",
    description: "Offline-first rewrite of the field app.",
  });
  await c.projects.addMember(sam, mobile.id, { email: dana.email });

  for (const [project, owner, list] of [
    [website, dana, WEBSITE_TASKS],
    [mobile, sam, MOBILE_TASKS],
  ] as const) {
    for (const [title, status, who, due] of list) {
      const task = await c.tasks.create(owner, project.id, {
        title,
        status,
        assigneeId: who === null ? null : users[who]?.id,
        dueDate: due === null ? null : day(due),
      });
      if (title === "Write content migration plan") {
        await c.comments.add(sam, project.id, task.id, { body: "Can we keep the old blog URLs? SEO wants 1:1." });
        await c.comments.add(dana, project.id, task.id, { body: "Yes, the redirect map task covers it." });
      }
    }
  }
  return users.length;
}
