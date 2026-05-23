import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { ProductRead } from "./types";

export interface ProductWritePayload {
  sku?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  default_unit_price_cents?: number;
  default_currency?: string;
}

export type ProductPatchPayload = Partial<
  ProductWritePayload & { archived: boolean }
>;

export interface ListProductsParams {
  q?: string;
  category?: string;
  include_archived?: boolean;
  page?: number;
  page_size?: number;
}

export const listProducts = (params: ListProductsParams = {}) =>
  get<ProductRead[]>(`/api/products${qs({ ...params })}`);

export const getProduct = (id: string) =>
  get<ProductRead>(`/api/products/${id}`);

export const createProduct = (payload: ProductWritePayload) =>
  post<ProductRead>("/api/products", payload);

export const patchProduct = (id: string, payload: ProductPatchPayload) =>
  patch<ProductRead>(`/api/products/${id}`, payload);

export const deleteProduct = (id: string) =>
  del<void>(`/api/products/${id}`);
