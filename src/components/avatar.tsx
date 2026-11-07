const COLORS = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-fuchsia-500"];

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length] ?? "bg-sky-500";
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const dim = size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span
      title={name}
      className={`${dim} ${colorFor(name)} grid shrink-0 place-items-center rounded-full font-semibold text-white`}
    >
      {initials}
    </span>
  );
}
