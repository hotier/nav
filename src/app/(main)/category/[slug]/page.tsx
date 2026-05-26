import { auth } from "@/lib/auth";
import { CategoryContentClient } from "@/components/CategoryContentClient";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const session = await auth();

  return (
    <CategoryContentClient
      userId={session?.user?.id ?? null}
      slug={slug}
      isAdmin={session?.user?.role === "admin"}
    />
  );
}
