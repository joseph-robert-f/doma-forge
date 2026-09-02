import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findProduct } from "../../../lib/products/registry";
import { ProductApp } from "../../components/ProductApp";

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = findProduct(id);
  if (!product) notFound();

  return {
    title: { absolute: product.copy.title },
    description: product.copy.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = findProduct(id);
  if (!product) notFound();

  return <ProductApp key={product.id} productId={product.id} />;
}
