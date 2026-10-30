import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Edit,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import type { ApiAdminProduct, ApiAdminProductCreate, ApiAdminProductUpdate } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading, TextLink } from "./shared";
import { ImageUploadField } from "./image-upload-field";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 409) return "A product with this SKU already exists.";
    if (caught.status === 422) return "Invalid product data.";
    return caught.message;
  }
  return fallback;
}

const FIT_OPTIONS = ["Tight", "Moderate", "Relaxed"] as const;
const CATEGORY_OPTIONS = ["Climbing Shoes", "Chalk", "Apparel", "Accessories", "Training", "Other"] as const;

/* -------------------------------------------------------------------------- */
/* Product form (shared for create and edit)                                  */
/* -------------------------------------------------------------------------- */

interface ProductFormProps {
  product?: ApiAdminProduct;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProductForm({ product, submitLabel, onSaved, open, onOpenChange }: ProductFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "ARCH Selection");
  const [category, setCategory] = useState(product?.category ?? "Climbing Shoes");
  const [fit, setFit] = useState(product?.fit ?? "Moderate");
  const [priceVnd, setPriceVnd] = useState(product?.price_vnd ?? 0);
  const [description, setDescription] = useState(product?.description ?? "");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitDisabled = !hydrated || pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedSku = sku.trim();
    const trimmedName = name.trim();
    if (!trimmedSku) {
      setError("SKU is required.");
      return;
    }
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (priceVnd < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    if (stock < 0) {
      setError("Stock must be a non-negative number.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!product) {
        await adminApi.createProduct({
          sku: trimmedSku,
          name: trimmedName,
          brand: brand.trim(),
          category,
          fit,
          price_vnd: priceVnd,
          description: description.trim(),
          image_url: imageUrl.trim() || null,
          stock,
          is_active: isActive,
        });
        setSku("");
        setName("");
        setBrand("ARCH Selection");
        setCategory("Climbing Shoes");
        setFit("Moderate");
        setPriceVnd(0);
        setDescription("");
        setImageUrl("");
        setStock(0);
        setIsActive(true);
        setSuccess("Product created.");
      } else {
        const body: ApiAdminProductUpdate = {};
        if (trimmedSku !== product.sku) body.sku = trimmedSku;
        if (trimmedName !== product.name) body.name = trimmedName;
        if (brand.trim() !== product.brand) body.brand = brand.trim();
        if (category !== product.category) body.category = category;
        if (fit !== product.fit) body.fit = fit;
        if (priceVnd !== product.price_vnd) body.price_vnd = priceVnd;
        if (description.trim() !== product.description) body.description = description.trim();
        if (imageUrl.trim() !== (product.image_url ?? "")) body.image_url = imageUrl.trim() || null;
        if (stock !== product.stock) body.stock = stock;
        if (isActive !== product.is_active) body.is_active = isActive;

        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }

        await adminApi.updateProduct(product.id, body);
        onSaved();
        setSuccess("Product updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    } catch (caught) {
      setError(errorMessage(caught, "The product could not be saved."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Create product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Only changed fields are sent to the API. An empty image URL clears the existing link."
              : "Fill in the required fields. All other fields are optional."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <div className="form-row">
            <Label>
              SKU <span className="label-hint">required</span>
              <Input
                required
                value={sku}
                minLength={1}
                maxLength={40}
                onChange={(event) => setSku(event.target.value)}
                disabled={pending}
                placeholder="SHOE-001"
              />
            </Label>
            <Label>
              Name <span className="label-hint">required</span>
              <Input
                required
                value={name}
                minLength={1}
                maxLength={140}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                placeholder="Miura VS"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Brand
              <Input
                value={brand}
                maxLength={80}
                onChange={(event) => setBrand(event.target.value)}
                disabled={pending}
                placeholder="La Sportiva"
              />
            </Label>
            <Label>
              Category
              <Select value={category} onValueChange={setCategory} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Fit
              <Select value={fit} onValueChange={setFit} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fit" />
                </SelectTrigger>
                <SelectContent>
                  {FIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label>
              Price (VND)
              <Input
                type="number"
                value={priceVnd}
                min={0}
                onChange={(event) => setPriceVnd(Number(event.target.value) || 0)}
                disabled={pending}
                placeholder="1500000"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Stock
              <Input
                type="number"
                value={stock}
                min={0}
                onChange={(event) => setStock(Number(event.target.value) || 0)}
                disabled={pending}
                placeholder="10"
              />
            </Label>
            <Label>
              Status
              <Select value={isActive ? "active" : "inactive"} onValueChange={(v) => setIsActive(v === "active")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Label>
          </div>

          <Label>
            Description <span className="label-hint">optional</span>
            <Textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              placeholder="Key features, materials, sizing notes…"
            />
          </Label>

          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            label="Upload Image"
            placeholder="https://example.com/product-image.jpg"
            accept="image/jpeg,image/png,image/webp"
            maxSize={10 * 1024 * 1024}
            disabled={pending}
            onError={setError}
            onSuccess={() => setSuccess("Image uploaded successfully.")}
          />

          <p className="auth-note">
            A link to a picture that is already published somewhere. The picture itself is never
            uploaded into the database. Leave empty to clear the image.
          </p>

          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="feedback" role="status">
              {success}
            </p>
          )}

          <div className="form-row">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X /> Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Product list table                                                         */
/* -------------------------------------------------------------------------- */

function ProductTable({ products, onEdit, onToggleActive }: {
  products: ApiAdminProduct[];
  onEdit: (product: ApiAdminProduct) => void;
  onToggleActive: (product: ApiAdminProduct) => void;
}) {
  if (products.length === 0) {
    return (
      <EmptyNotice
        title="No products yet."
        description="Create the first product below to start building the catalogue."
      />
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Price (VND)</th>
            <th>Stock</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <code>{product.sku}</code>
              </td>
              <td>
                <strong>{product.name}</strong>
              </td>
              <td>{product.brand}</td>
              <td>{product.category}</td>
              <td>{product.price_vnd.toLocaleString()}</td>
              <td>{product.stock}</td>
              <td>
                <span className={product.is_active ? "status-sent" : "status-project"}>
                  {product.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <div className="task-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(product)}
                    aria-label={`Edit ${product.name}`}
                  >
                    <Edit size={14} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleActive(product)}
                    aria-label={product.is_active ? `Deactivate ${product.name}` : `Activate ${product.name}`}
                  >
                    <RotateCcw size={14} />
                    {product.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product Management Page                                                    */
/* -------------------------------------------------------------------------- */

export function ProductManagementPage() {
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState<ApiAdminProduct | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ApiAdminProduct | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminApi.products(),
    retry: false,
  });

  async function handleToggleActive(product: ApiAdminProduct) {
    setConfirmDeactivate(product);
  }

  async function confirmToggleActive(product: ApiAdminProduct) {
    setToggleError(null);
    try {
      await adminApi.updateProduct(product.id, { is_active: !product.is_active });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    } catch (caught) {
      setToggleError(errorMessage(caught, "The product status could not be changed."));
    } finally {
      setConfirmDeactivate(null);
    }
  }

  if (products.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading products…</p>
      </div>
    );
  }

  if (products.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Products could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => products.refetch()}>
          <RotateCcw size={14} /> Retry
        </Button>
      </div>
    );
  }

  const list = products.data ?? [];

  return (
    <>
      <ProductTable
        products={list}
        onEdit={setEditingProduct}
        onToggleActive={handleToggleActive}
      />

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Create a new product</h2>
            <p>All fields except SKU and name are optional.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>New product</Button>
        </div>
      </section>

      {toggleError && (
        <p className="feedback error" role="alert">
          {toggleError}
        </p>
      )}

      <ProductForm
        submitLabel="Create product"
        onSaved={() => {}}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingProduct && (
        <ProductForm
          key={editingProduct.id}
          product={editingProduct}
          submitLabel="Save changes"
          onSaved={() => setEditingProduct(null)}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingProduct(null);
          }}
        />
      )}

      {confirmDeactivate && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setConfirmDeactivate(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmDeactivate.is_active ? "Deactivate product" : "Activate product"}
              </DialogTitle>
              <DialogDescription>
                This will {confirmDeactivate.is_active ? "hide" : "show"} the product on the public site.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant={confirmDeactivate.is_active ? "destructive" : "default"}
                onClick={() => confirmToggleActive(confirmDeactivate)}
              >
                {confirmDeactivate.is_active ? "Deactivate" : "Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export { ProductForm, ProductTable };