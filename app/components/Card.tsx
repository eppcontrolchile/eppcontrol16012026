type CardProps = {
  title: string;
  value: React.ReactNode;
  href?: string;
};

export default function Card({ title, value, href }: CardProps) {
  const content = (
    <div className="rounded-xl border bg-white p-4 hover:bg-zinc-50 transition">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );

  return href ? <a href={href}>{content}</a> : content;
}
