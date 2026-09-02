import type { Metadata } from "next";
import { DEFAULT_PRODUCT_ID, getProduct } from "../lib/products/registry";
import { ProductApp } from "./components/ProductApp";

const defaultProduct = getProduct(DEFAULT_PRODUCT_ID);

export const metadata: Metadata = {
  title: { absolute: defaultProduct.copy.title },
  description: defaultProduct.copy.description,
};

export default function Home() {
  return <ProductApp key={DEFAULT_PRODUCT_ID} productId={DEFAULT_PRODUCT_ID} />;
}
