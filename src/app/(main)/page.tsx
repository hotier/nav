import { auth } from "@/lib/auth";
import { getLinkCount } from "@/lib/queries";
import { HomeContentClient } from "@/components/HomeContentClient";

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;

  const linkCount = await getLinkCount(userId);

  return (
    <HomeContentClient
      userId={userId ?? null}
      linkCount={linkCount}
      isAdmin={session?.user?.role === "admin"}
    />
  );
}
