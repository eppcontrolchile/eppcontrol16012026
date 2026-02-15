// app/m/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MRoot() {
  // /m NO muestra landing: siempre va a la pantalla operativa
  redirect("/m/entrega");
}
