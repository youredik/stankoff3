import { LegacyProduct } from '../entities/legacy-product.entity';
import { LegacyCategory } from '../entities/legacy-category.entity';

/**
 * DTO для товара из legacy системы
 */
export class LegacyProductDto {
  id: number;
  name: string;
  uri: string | null;
  price: number;
  categoryId: number;
  categoryName?: string;
  supplierId: number | null;
  productCode: string | null;
  factoryName: string | null;
  briefDescription: string | null;
  isInStock: boolean;
  inStock: number;

  static fromEntity(entity: LegacyProduct, category?: LegacyCategory): LegacyProductDto {
    const dto = new LegacyProductDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.uri = entity.uri;
    dto.price = Number(entity.price);
    dto.categoryId = entity.categoryId;
    dto.categoryName = category?.name;
    dto.supplierId = entity.supplierId;
    dto.productCode = entity.productCode;
    dto.factoryName = entity.factoryName;
    dto.briefDescription = entity.briefDescription;
    dto.isInStock = entity.isInStock;
    dto.inStock = entity.inStock;
    return dto;
  }
}

/**
 * DTO для результатов поиска товаров
 */
export class LegacyProductSearchResultDto {
  items: LegacyProductDto[];
  total: number;
  limit: number;
  offset: number;
}
