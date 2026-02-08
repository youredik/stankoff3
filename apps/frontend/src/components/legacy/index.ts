// Legacy CRM компоненты
// Эти компоненты предоставляют UI для работы с данными из Legacy CRM (read-only)

export { LegacyCustomerPicker } from './LegacyCustomerPicker';
export { LegacyProductPicker } from './LegacyProductPicker';
export { LegacyCounterpartyPicker } from './LegacyCounterpartyPicker';
export { LegacyDealLink, LegacyDealsList } from './LegacyDealLink';

// Re-export API и типы для удобства
export { legacyApi, legacyUrls } from '@/lib/api/legacy';
export type {
  LegacyCustomer,
  LegacyProduct,
  LegacyCounterparty,
  LegacyDeal,
  LegacyEmployee,
  LegacyCategory,
  LegacyDepartment,
  LegacyHealthStatus,
} from '@/types/legacy';
