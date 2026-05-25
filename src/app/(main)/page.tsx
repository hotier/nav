import { auth } from "@/lib/auth";
import { getAllLinks } from "@/lib/queries";
import { HomeContentClient } from "@/components/HomeContentClient";

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;

  const allLinks = await getAllLinks(userId);

  return (
    <HomeContentClient
      linkCount={allLinks.length}
      isAdmin={session?.user?.role === "admin"}
    />
  );
}
