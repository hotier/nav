import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { MainLayout } from "@/components/MainLayout";
import type { Category } from "@/types";

export default async function MainLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  const categories = await getCategories(userId);

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <MainLayout categories={categories as unknown as Category[]}>
        {children}
      </MainLayout>
    </Suspense>
  );
}
