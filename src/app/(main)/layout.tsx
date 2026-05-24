import { getCategories } from "@/lib/queries";
import { MainLayout } from "@/components/MainLayout";
import type { Category } from "@/types";

export default async function MainLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategories();

  return (
    <MainLayout categories={categories as unknown as Category[]}>
      {children}
    </MainLayout>
  );
}
