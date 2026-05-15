from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.models import Product, QuoteLine, utcnow
from app.schemas import ProductPatch, ProductRead, ProductWrite
from app.services.field_values import record_values

router = APIRouter(prefix="/api/products", tags=["products"])


def _read(product: Product) -> ProductRead:
    return ProductRead(
        id=product.id,
        sku=product.sku,
        name=product.name,
        description=product.description,
        category=product.category,
        default_unit_price_cents=product.default_unit_price_cents,
        default_currency=product.default_currency,
        archived=product.archived,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


@router.get("", response_model=list[ProductRead])
def list_products(
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    include_archived: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[ProductRead]:
    stmt = select(Product)
    if not include_archived:
        stmt = stmt.where(Product.archived == False)  # noqa: E712
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Product.name).like(like),
                func.lower(Product.sku).like(like),
            )
        )
    if category:
        stmt = stmt.where(Product.category == category)
    stmt = (
        stmt.order_by(Product.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(session.exec(stmt).all())
    return [_read(p) for p in rows]


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductWrite, session: Session = Depends(get_session)
) -> ProductRead:
    if payload.sku:
        existing = session.exec(
            select(Product).where(Product.sku == payload.sku)
        ).first()
        if existing is not None:
            raise HTTPException(
                status_code=409, detail="Product SKU already exists"
            )
    product = Product(**payload.model_dump())
    session.add(product)
    record_values(
        session,
        {
            "product.category": payload.category,
            "product.currency": payload.default_currency,
        },
    )
    session.commit()
    session.refresh(product)
    return _read(product)


@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: str, session: Session = Depends(get_session)
) -> ProductRead:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _read(product)


@router.patch("/{product_id}", response_model=ProductRead)
def patch_product(
    product_id: str,
    payload: ProductPatch,
    session: Session = Depends(get_session),
) -> ProductRead:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump(exclude_unset=True)
    next_sku = data.get("sku", product.sku)
    if next_sku and next_sku != product.sku:
        conflict = session.exec(
            select(Product).where(Product.sku == next_sku, Product.id != product.id)
        ).first()
        if conflict is not None:
            raise HTTPException(
                status_code=409, detail="Product SKU already exists"
            )
    for key, value in data.items():
        setattr(product, key, value)
    product.updated_at = utcnow()
    session.add(product)
    record_values(
        session,
        {
            "product.category": data.get("category"),
            "product.currency": data.get("default_currency"),
        },
    )
    session.commit()
    session.refresh(product)
    return _read(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: str, session: Session = Depends(get_session)
) -> None:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    used = session.exec(
        select(func.count())
        .select_from(QuoteLine)
        .where(QuoteLine.product_id == product.id)
    ).first() or 0
    if int(used) > 0:
        # Archive instead of delete so historical quotes keep their reference.
        product.archived = True
        product.updated_at = utcnow()
        session.add(product)
        session.commit()
        return None
    session.delete(product)
    session.commit()
