import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/user.entity';
import { WorkspaceEntity } from '../modules/entity/entity.entity';
import { Comment } from '../modules/entity/comment.entity';
import { SeedWorkspaces } from './seed-structure.service';
import { EMPLOYEES } from './data/employees';

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Типы ───────────────────────────────────────────────────────────────────

interface EntityDef {
  num: number;
  title: string;
  status: string;
  priority?: string;
  data?: Record<string, unknown>;
  createdDaysAgo: number;
}

interface CommentDef {
  text: string;
  offsetDays: number;
}

interface WorkspaceEntities {
  wsKey: string;
  prefix: string;
  departmentKeys: string[];
  entities: EntityDef[];
  comments: Record<number, CommentDef[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Данные для каждого workspace
// ═══════════════════════════════════════════════════════════════════════════

// ─── ZK: Заявки клиентов ─────────────────────────────────────────────────

const ZK_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Запрос на лазерный станок OPC-1530', status: 'in_progress', priority: 'high', data: { customer: 'ООО ТехноЛазер', equipment_type: 'Лазерный станок' }, createdDaysAgo: 12 },
  { num: 2, title: 'Консультация по токарному станку CK6140', status: 'new', priority: 'medium', data: { customer: 'ИП Петров А.В.', equipment_type: 'Токарный станок' }, createdDaysAgo: 3 },
  { num: 3, title: 'Заказ фрезерного станка VMC850', status: 'payment', priority: 'high', data: { customer: 'ООО МеталлСервис', equipment_type: 'Фрезерный станок', amount: 4500000 }, createdDaysAgo: 20 },
  { num: 4, title: 'Запрос стоимости листогиба HPB-100', status: 'in_progress', priority: 'medium', data: { customer: 'АО Промзавод', equipment_type: 'Листогиб' }, createdDaysAgo: 8 },
  { num: 5, title: 'Комплексная поставка оборудования для мебельной фабрики', status: 'kp_ready', priority: 'critical', data: { customer: 'ООО МебельГрупп', equipment_type: 'Комплекс', amount: 18500000 }, createdDaysAgo: 30 },
  { num: 6, title: 'Подбор оборудования для металлообработки', status: 'new', priority: 'low', data: { customer: 'ООО СтальПром', equipment_type: 'Металлообработка' }, createdDaysAgo: 2 },
  { num: 7, title: 'Запрос на 3D-принтер промышленный', status: 'completed', priority: 'medium', data: { customer: 'ООО ПринтТех', equipment_type: '3D-принтер' }, createdDaysAgo: 45 },
  { num: 8, title: 'Поставка запчастей для станка Trumpf TruLaser', status: 'shipping', priority: 'high', data: { customer: 'ЗАО Лазермет', equipment_type: 'Запчасти' }, createdDaysAgo: 15 },
  { num: 9, title: 'Консультация по выбору плоттера', status: 'rejected', priority: 'low', data: { customer: 'ИП Сидоров Н.', equipment_type: 'Плоттер' }, createdDaysAgo: 25 },
  { num: 10, title: 'Пакетное предложение: 5 станков для завода', status: 'in_progress', priority: 'critical', data: { customer: 'ОАО Машзавод', equipment_type: 'Комплекс', amount: 32000000 }, createdDaysAgo: 7 },
];

const ZK_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Связался с клиентом, ждём ответ по спецификации. Интересует модель OPC-1530 с автоподачей.', offsetDays: 1 },
    { text: 'Клиент подтвердил потребность, готовим КП. Нужна конфигурация с ЧПУ Cypcut.', offsetDays: 3 },
    { text: 'КП отправлено, сумма 2.8 млн. Ждём обратную связь.', offsetDays: 5 },
  ],
  2: [
    { text: 'Клиент звонил, интересуется характеристиками CK6140. Отправил каталог.', offsetDays: 0 },
    { text: 'Уточнить наличие на складе в Казани.', offsetDays: 1 },
  ],
  3: [
    { text: 'Счёт выставлен, ожидаем оплату от клиента.', offsetDays: 2 },
    { text: 'Клиент запросил рассрочку на 3 месяца. Согласовать с руководством.', offsetDays: 5 },
    { text: 'Рассрочка одобрена. Первый платёж получен, остаток до 15 числа.', offsetDays: 8 },
    { text: 'Предоплата 50% поступила на счёт.', offsetDays: 12 },
  ],
  4: [
    { text: 'Запросили прайс у поставщика. Ответ ожидается завтра.', offsetDays: 1 },
    { text: 'Получили прайс. HPB-100 — 3.4 млн. Формируем КП для клиента.', offsetDays: 3 },
  ],
  5: [
    { text: 'Крупный заказ! Нужен полный комплект: форматно-раскроечный, кромкооблицовочный, сверлильно-присадочный, шлифовальный и фрезерный с ЧПУ.', offsetDays: 1 },
    { text: 'КП на 18.5 млн готово. Включена доставка и пуско-наладка.', offsetDays: 5 },
    { text: 'Клиент попросил добавить аспирационную систему. Пересчитываем.', offsetDays: 10 },
    { text: 'Обновлённое КП на 20.2 млн отправлено. Ждём решения директора фабрики.', offsetDays: 15 },
    { text: 'Согласовано с руководством, приступаем к оформлению.', offsetDays: 20 },
  ],
  6: [
    { text: 'Новая заявка с сайта. Уточнить потребности клиента.', offsetDays: 0 },
  ],
  7: [
    { text: 'Клиент выбрал модель. Оформляем заказ.', offsetDays: 5 },
    { text: 'Оплата получена, товар отгружен.', offsetDays: 15 },
    { text: 'Клиент подтвердил получение. Заявка закрыта.', offsetDays: 25 },
  ],
  8: [
    { text: 'Запчасти для Trumpf — нужен комплект линз и сопел. Проверяю наличие.', offsetDays: 1 },
    { text: 'Часть запчастей есть на складе, остальные заказаны у поставщика. Срок 5 дней.', offsetDays: 3 },
    { text: 'Всё укомплектовано, передано в логистику на отгрузку.', offsetDays: 7 },
  ],
  9: [
    { text: 'Клиент передумал, бюджет урезали. Заявку закрываем.', offsetDays: 5 },
  ],
  10: [
    { text: 'Встреча с представителями завода назначена на пятницу. Готовлю презентацию.', offsetDays: 1 },
    { text: 'Провёл встречу. Заводу нужны: 2 токарных, 2 фрезерных и 1 шлифовальный. Бюджет до 35 млн.', offsetDays: 3 },
    { text: 'Формирую коммерческое предложение с вариантами комплектации.', offsetDays: 5 },
  ],
};

// ─── KP: Коммерческие предложения ───────────────────────────────────────

const KP_ENTITIES: EntityDef[] = [
  { num: 1, title: 'КП для ООО «Метком» — линия лазерной резки', status: 'sent', data: { deal_amount: 12500000, customer: 'ООО Метком' }, createdDaysAgo: 18 },
  { num: 2, title: 'КП для АО «Древторг» — столярный комплекс', status: 'won', data: { deal_amount: 4800000, customer: 'АО Древторг' }, createdDaysAgo: 40 },
  { num: 3, title: 'КП для ИП Садыков — токарный станок', status: 'draft', data: { deal_amount: 1200000, customer: 'ИП Садыков' }, createdDaysAgo: 5 },
  { num: 4, title: 'КП для «СтройМаш» — фрезерный центр', status: 'approved', data: { deal_amount: 8900000, customer: 'ООО СтройМаш' }, createdDaysAgo: 22 },
  { num: 5, title: 'КП для «ПромТех» — листогибочный пресс', status: 'lost', data: { deal_amount: 3400000, customer: 'ООО ПромТех' }, createdDaysAgo: 35 },
  { num: 6, title: 'КП для «ЮграСервис» — сервисное обслуживание', status: 'review', data: { deal_amount: 780000, customer: 'ООО ЮграСервис' }, createdDaysAgo: 10 },
  { num: 7, title: 'КП для «КазаньЛес» — лесопильная линия', status: 'sent', data: { deal_amount: 15600000, customer: 'ООО КазаньЛес' }, createdDaysAgo: 14 },
  { num: 8, title: 'КП для «НижнекамскНефтехим» — труборез', status: 'approved', data: { deal_amount: 2100000, customer: 'АО НижнекамскНефтехим' }, createdDaysAgo: 25 },
];

const KP_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'КП сформировано. Лазерная линия: 2 станка OPC-1530 + загрузочный стол + аспирация.', offsetDays: 2 },
    { text: 'Отправил клиенту. Ожидаем ответ до конца недели.', offsetDays: 5 },
    { text: 'Клиент просит скидку 5%. Согласовать с директором.', offsetDays: 10 },
  ],
  2: [
    { text: 'КП принято! Клиент подписал спецификацию.', offsetDays: 10 },
    { text: 'Договор подписан, предоплата поступила. Передаём в логистику.', offsetDays: 20 },
  ],
  3: [
    { text: 'Черновик КП. Уточнить комплектацию с клиентом — какие патроны нужны.', offsetDays: 1 },
    { text: 'Клиент хочет 3-кулачковый и цанговый патрон. Обновляю КП.', offsetDays: 3 },
  ],
  4: [
    { text: 'КП на 8.9 млн одобрено руководством. Готовим к отправке.', offsetDays: 5 },
    { text: 'Клиент запросил добавить систему подачи СОЖ. Пересчитываем.', offsetDays: 10 },
    { text: 'Обновлённое КП на 9.4 млн согласовано.', offsetDays: 15 },
  ],
  5: [
    { text: 'Клиент выбрал конкурента — у них дешевле на 15%. Проиграли по цене.', offsetDays: 20 },
    { text: 'Зафиксировал причину проигрыша. Нужно проработать ценообразование на листогибы.', offsetDays: 21 },
  ],
  6: [
    { text: 'КП на годовое ТО: 4 визита инженера + расходные материалы.', offsetDays: 2 },
    { text: 'На рассмотрении у технического директора клиента.', offsetDays: 5 },
  ],
  7: [
    { text: 'Лесопильная линия: ленточнопильный + кромкообрезной + торцовочный.', offsetDays: 3 },
    { text: 'КП отправлено. Клиент обещал ответ после совещания.', offsetDays: 7 },
    { text: 'Позвонили — совещание перенесли на следующую неделю. Ждём.', offsetDays: 10 },
  ],
  8: [
    { text: 'КП согласовано. Труборез с ЧПУ — срок поставки 6 недель.', offsetDays: 5 },
    { text: 'Клиент подтвердил, ждём подписание договора.', offsetDays: 12 },
  ],
};

// ─── SZ: Сервисные заявки ───────────────────────────────────────────────

const SZ_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Не работает шпиндель на станке VMC650', status: 'in_repair', priority: 'critical', data: { equipment: 'VMC650', serial_number: 'VMC650-2023-1187', customer: 'ООО МеталлПро' }, createdDaysAgo: 5 },
  { num: 2, title: 'Плановое ТО лазерного станка OPC-1530', status: 'ready', priority: 'low', data: { equipment: 'OPC-1530', serial_number: 'OPC1530-2024-0342', customer: 'ООО ТехноЛазер' }, createdDaysAgo: 30 },
  { num: 3, title: 'Замена ЧПУ-контроллера Fanuc', status: 'waiting_parts', priority: 'high', data: { equipment: 'VMC850', serial_number: 'VMC850-2022-0891', customer: 'АО Промзавод' }, createdDaysAgo: 14 },
  { num: 4, title: 'Калибровка координатно-измерительной машины', status: 'diagnostics', priority: 'medium', data: { equipment: 'КИМ Carl Zeiss', customer: 'ООО ПрецизионТех' }, createdDaysAgo: 7 },
  { num: 5, title: 'Ремонт гидравлического пресса HPB-200', status: 'new', priority: 'high', data: { equipment: 'HPB-200', serial_number: 'HPB200-2023-0156', customer: 'ООО ЛистМет' }, createdDaysAgo: 2 },
  { num: 6, title: 'Установка и пуско-наладка токарного станка', status: 'testing', priority: 'medium', data: { equipment: 'CK6140', serial_number: 'CK6140-2025-0023', customer: 'ИП Иванов С.П.' }, createdDaysAgo: 10 },
  { num: 7, title: 'Замена лазерной трубки CO2', status: 'ready', priority: 'medium', data: { equipment: 'OPC-6090', serial_number: 'OPC6090-2021-0445', customer: 'ООО ГравирМастер' }, createdDaysAgo: 20 },
  { num: 8, title: 'Диагностика электрической системы фрезерного станка', status: 'in_repair', priority: 'high', data: { equipment: 'VMC650', serial_number: 'VMC650-2024-1302', customer: 'ООО СтальПром' }, createdDaysAgo: 6 },
  { num: 9, title: 'Обновление ПО ЧПУ до версии 4.2', status: 'delivered', priority: 'low', data: { equipment: 'VMC850', customer: 'ЗАО ТочМех' }, createdDaysAgo: 25 },
  { num: 10, title: 'Выезд инженера: не работает система охлаждения', status: 'diagnostics', priority: 'critical', data: { equipment: 'OPC-1530', serial_number: 'OPC1530-2024-0198', customer: 'ООО ЛазерРез' }, createdDaysAgo: 1 },
];

const SZ_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Шпиндель заклинило при работе на 8000 об/мин. Клиент остановил производство.', offsetDays: 0 },
    { text: 'Выехал на объект. Диагностика показала износ подшипников. Нужна замена.', offsetDays: 1 },
    { text: 'Запчасти заказаны, ориентировочный срок ремонта — 3 дня.', offsetDays: 2 },
  ],
  2: [
    { text: 'Плановое ТО выполнено: замена линз, чистка оптики, калибровка.', offsetDays: 5 },
    { text: 'Все параметры в норме. Рекомендовал следующее ТО через 6 месяцев.', offsetDays: 5 },
  ],
  3: [
    { text: 'Контроллер Fanuc 0i-MF вышел из строя — ошибка SV0401. Нужна замена платы.', offsetDays: 1 },
    { text: 'Заказали плату у официального дилера Fanuc. Срок поставки 2-3 недели.', offsetDays: 3 },
    { text: 'Поставщик подтвердил отгрузку на следующей неделе.', offsetDays: 7 },
    { text: 'Запчасть отправлена, трек-номер получен. Ожидаем доставку.', offsetDays: 10 },
  ],
  4: [
    { text: 'Начал диагностику КИМ. Проверяю систему датчиков и направляющих.', offsetDays: 1 },
    { text: 'Обнаружено отклонение по оси Z: 0.015 мм при норме 0.005 мм. Нужна калибровка.', offsetDays: 3 },
  ],
  5: [
    { text: 'Клиент сообщил о протечке гидравлики. Нужен срочный выезд.', offsetDays: 0 },
    { text: 'Выезд запланирован на завтра. Беру набор уплотнений на всякий случай.', offsetDays: 1 },
  ],
  6: [
    { text: 'Станок установлен на фундамент. Приступаю к подключению электрики.', offsetDays: 2 },
    { text: 'Электрика подключена, запуск прошёл успешно. Начинаю пуско-наладку.', offsetDays: 4 },
    { text: 'Провёл тестовую обработку детали. Точность в пределах нормы.', offsetDays: 7 },
  ],
  7: [
    { text: 'Лазерная трубка заменена. Мощность восстановлена до 100%.', offsetDays: 5 },
    { text: 'Тест резки пройден. Станок готов к выдаче клиенту.', offsetDays: 8 },
  ],
  8: [
    { text: 'При включении выбивает автомат на 32А. Проверяю проводку.', offsetDays: 1 },
    { text: 'Обнаружен пробой изоляции на кабеле привода оси X. Заменяю кабель.', offsetDays: 3 },
    { text: 'Кабель заменён, изоляция проверена мегаомметром. Станок запускается нормально.', offsetDays: 4 },
  ],
  9: [
    { text: 'Обновление ПО прошло успешно. Новые функции протестированы.', offsetDays: 3 },
    { text: 'Станок передан клиенту. Инструкция по новым функциям отправлена на email.', offsetDays: 5 },
  ],
  10: [
    { text: 'СРОЧНО! Клиент сообщает о перегреве лазерной головки. Остановили работу.', offsetDays: 0 },
    { text: 'Выезжаю через час. Предварительно — засорение контура охлаждения.', offsetDays: 0 },
  ],
};

// ─── REK: Рекламации ────────────────────────────────────────────────────

const REK_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Рекламация: брак сварного шва на станине', status: 'investigation', priority: 'major', data: { customer: 'ООО МеталлПро', order_number: 'ЗК-2847' }, createdDaysAgo: 15 },
  { num: 2, title: 'Рекламация: несоответствие комплектации', status: 'decision', priority: 'minor', data: { customer: 'ИП Климов В.Р.', order_number: 'ЗК-2901' }, createdDaysAgo: 10 },
  { num: 3, title: 'Рекламация: выход из строя шпинделя через 2 месяца', status: 'received', priority: 'critical', data: { customer: 'ООО ТочМех', order_number: 'ЗК-2756' }, createdDaysAgo: 3 },
  { num: 4, title: 'Рекламация: царапины на корпусе при доставке', status: 'execution', priority: 'minor', data: { customer: 'АО ПромСтрой', order_number: 'ЗК-2889' }, createdDaysAgo: 20 },
  { num: 5, title: 'Рекламация: неточность позиционирования после установки', status: 'closed', priority: 'major', data: { customer: 'ООО ПрецизионТех', order_number: 'ЗК-2634' }, createdDaysAgo: 45 },
  { num: 6, title: 'Рекламация: шум при работе на высоких оборотах', status: 'investigation', priority: 'major', data: { customer: 'ООО Древторг', order_number: 'ЗК-2912' }, createdDaysAgo: 8 },
];

const REK_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Клиент предоставил фото. Визуально виден дефект сварного шва на станине.', offsetDays: 1 },
    { text: 'Запросили акт дефектовки у поставщика. Ожидаем ответ.', offsetDays: 3 },
    { text: 'Назначена экспертиза. Инженер выезжает на объект для осмотра.', offsetDays: 7 },
  ],
  2: [
    { text: 'Клиент получил станок без набора ключей и масла для ТО.', offsetDays: 0 },
    { text: 'Проверили упаковочный лист — комплектующие отсутствуют по вине склада.', offsetDays: 2 },
    { text: 'Решение: доотправить комплектующие курьером за наш счёт.', offsetDays: 5 },
  ],
  3: [
    { text: 'Получена рекламация. Шпиндель вышел из строя через 2 месяца эксплуатации при гарантии 12 месяцев.', offsetDays: 0 },
    { text: 'Запросили у клиента журнал режимов работы для анализа причин.', offsetDays: 1 },
  ],
  4: [
    { text: 'Транспортная компания признала повреждение при перевозке. Оформляем акт.', offsetDays: 3 },
    { text: 'Акт подписан. Заказали покраску корпуса у подрядчика.', offsetDays: 8 },
    { text: 'Корпус покрашен, станок у клиента. Рекламация в процессе закрытия.', offsetDays: 15 },
  ],
  5: [
    { text: 'После повторной калибровки точность позиционирования пришла в норму (±0.005 мм).', offsetDays: 10 },
    { text: 'Клиент подтвердил, что проблема решена. Закрываем рекламацию.', offsetDays: 20 },
  ],
  6: [
    { text: 'Шум появляется при оборотах выше 6000. Предположительно — дисбаланс шпинделя.', offsetDays: 1 },
    { text: 'Назначен выезд инженера на следующую неделю для диагностики.', offsetDays: 3 },
    { text: 'Инженер подтвердил дисбаланс. Шпиндель нужно снять для балансировки.', offsetDays: 6 },
  ],
};

// ─── MK: Маркетинговые задачи ───────────────────────────────────────────

const MK_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Подготовка к выставке «Металлообработка 2026»', status: 'in_progress', priority: 'high', data: { task_type: 'exhibition' }, createdDaysAgo: 45 },
  { num: 2, title: 'Обновление каталога продукции на сайте', status: 'done', priority: 'medium', data: { task_type: 'content' }, createdDaysAgo: 30 },
  { num: 3, title: 'Рекламная кампания в Яндекс.Директ — лазерные станки', status: 'in_progress', priority: 'high', data: { task_type: 'ads' }, createdDaysAgo: 20 },
  { num: 4, title: 'Съёмка видеообзора нового токарного станка', status: 'review', priority: 'medium', data: { task_type: 'content' }, createdDaysAgo: 12 },
  { num: 5, title: 'Исследование рынка деревообрабатывающего оборудования', status: 'backlog', priority: 'low', data: { task_type: 'research' }, createdDaysAgo: 5 },
  { num: 6, title: 'Email-рассылка: акция на запчасти', status: 'done', priority: 'medium', data: { task_type: 'ads' }, createdDaysAgo: 25 },
  { num: 7, title: 'Оформление стенда для выставки в Казани', status: 'in_progress', priority: 'high', data: { task_type: 'exhibition' }, createdDaysAgo: 18 },
  { num: 8, title: 'SEO оптимизация карточек товаров', status: 'review', priority: 'medium', data: { task_type: 'content' }, createdDaysAgo: 14 },
];

const MK_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Подали заявку на участие. Стенд 36 кв.м в павильоне 2.', offsetDays: 2 },
    { text: 'Дизайн стенда утверждён. Заказали баннеры и промо-материалы.', offsetDays: 10 },
    { text: 'Нужно согласовать список оборудования для экспозиции. Минимум 3 станка.', offsetDays: 20 },
    { text: 'Логистика подтвердила доставку станков на выставку.', offsetDays: 30 },
  ],
  2: [
    { text: 'Обновлены карточки всех лазерных станков — новые фото и описания.', offsetDays: 5 },
    { text: 'Фрезерные станки тоже обновлены. Осталось дообработать токарные.', offsetDays: 10 },
    { text: 'Каталог полностью обновлён. Добавлены 3D-модели для ключевых позиций.', offsetDays: 15 },
  ],
  3: [
    { text: 'Запустил кампанию в Директе. Бюджет 150К/мес, целевой CTR — 3%.', offsetDays: 2 },
    { text: 'Первая неделя: CTR 2.8%, 45 кликов, 3 заявки. Нужно доработать объявления.', offsetDays: 9 },
    { text: 'Оптимизировал заголовки и описания. CTR вырос до 3.5%.', offsetDays: 14 },
  ],
  4: [
    { text: 'Видео снято. Хронометраж 8 минут. Отправил на монтаж.', offsetDays: 3 },
    { text: 'Первая версия монтажа готова. Нужна правка звука — фон шумит.', offsetDays: 7 },
    { text: 'Финальная версия на проверке у руководства.', offsetDays: 10 },
  ],
  5: [
    { text: 'Задача в бэклоге. Начнём после завершения подготовки к выставке.', offsetDays: 0 },
  ],
  6: [
    { text: 'Рассылка отправлена по базе 12К контактов. Open rate 24%, CTR 5.2%.', offsetDays: 5 },
    { text: 'Результат: 15 заявок на запчасти на сумму 890К. Отличный ROI.', offsetDays: 10 },
  ],
  7: [
    { text: 'Выставка в Казани через 3 недели. Нужен стенд 18 кв.м.', offsetDays: 1 },
    { text: 'Макет стенда согласован. Заказали печать баннеров.', offsetDays: 5 },
    { text: 'Баннеры готовы. Ещё нужны буклеты — 500 шт.', offsetDays: 10 },
  ],
  8: [
    { text: 'Проанализировал текущие позиции. По «лазерный станок купить» — 15 место.', offsetDays: 2 },
    { text: 'Переписал мета-теги и описания для 50 карточек. На проверке.', offsetDays: 7 },
  ],
};

// ─── KN: Контент-план ───────────────────────────────────────────────────

const KN_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Статья: Как выбрать лазерный станок для малого бизнеса', status: 'published', data: { platform: 'website' }, createdDaysAgo: 35 },
  { num: 2, title: 'Видео: Обзор фрезерного центра VMC850', status: 'editing', data: { platform: 'youtube' }, createdDaysAgo: 14 },
  { num: 3, title: 'Пост: Наша команда на выставке', status: 'idea', data: { platform: 'social' }, createdDaysAgo: 3 },
  { num: 4, title: 'Email: Новинки каталога Q1 2026', status: 'writing', data: { platform: 'email' }, createdDaysAgo: 8 },
  { num: 5, title: 'Статья: 5 ошибок при покупке б/у станка', status: 'published', data: { platform: 'website' }, createdDaysAgo: 50 },
  { num: 6, title: 'Видео: Пуско-наладка за 1 день', status: 'writing', data: { platform: 'youtube' }, createdDaysAgo: 10 },
];

const KN_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Статья опубликована. 2500 символов, оптимизирована под SEO.', offsetDays: 10 },
    { text: 'За месяц — 1200 просмотров и 8 заявок. Хороший результат.', offsetDays: 25 },
  ],
  2: [
    { text: 'Сценарий утверждён. Съёмка в шоуруме в четверг.', offsetDays: 3 },
    { text: 'Отснято 45 минут материала. Монтажёр берёт в работу.', offsetDays: 7 },
    { text: 'Первый монтаж готов — 12 минут. Нужно сократить до 8.', offsetDays: 10 },
  ],
  3: [
    { text: 'Идея: фоторепортаж с выставки для VK и Telegram. Подготовить шаблон поста.', offsetDays: 0 },
    { text: 'Шаблон готов. Будем публиковать в день выставки.', offsetDays: 2 },
  ],
  4: [
    { text: 'Собираю информацию о новинках Q1. Уже есть 5 новых позиций в каталоге.', offsetDays: 2 },
    { text: 'Текст email готов на 70%. Ещё нужны фото новинок.', offsetDays: 5 },
  ],
  5: [
    { text: 'Статья вышла в топ-3 по запросу «как выбрать б/у станок». Отличная SEO-статья.', offsetDays: 15 },
    { text: 'Добавили в статью блок с нашими услугами по диагностике б/у оборудования.', offsetDays: 30 },
  ],
  6: [
    { text: 'Пишу сценарий. Будем показывать реальную пуско-наладку токарного станка.', offsetDays: 2 },
    { text: 'Сценарий на согласовании у сервисного отдела — чтобы проверили техническую часть.', offsetDays: 5 },
  ],
};

// ─── SK: Складские операции ─────────────────────────────────────────────

const SK_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Приёмка партии лазерных станков (5 шт)', status: 'in_progress', data: { operation_type: 'receiving' }, createdDaysAgo: 4 },
  { num: 2, title: 'Инвентаризация запчастей и расходников', status: 'ready', data: { operation_type: 'inventory' }, createdDaysAgo: 15 },
  { num: 3, title: 'Отгрузка заказа №2847 в Москву', status: 'shipped', data: { operation_type: 'shipping' }, createdDaysAgo: 10 },
  { num: 4, title: 'Перемещение оборудования в новый ангар', status: 'new', data: { operation_type: 'transfer' }, createdDaysAgo: 2 },
  { num: 5, title: 'Комплектация заказа для «МеталлПро»', status: 'picking', data: { operation_type: 'shipping' }, createdDaysAgo: 3 },
  { num: 6, title: 'Приёмка расходных материалов от поставщика', status: 'shipped', data: { operation_type: 'receiving' }, createdDaysAgo: 20 },
];

const SK_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Контейнер прибыл. Начинаем разгрузку и осмотр.', offsetDays: 0 },
    { text: 'Разгружено 3 из 5 станков. Два оставшихся — завтра, нужен кран побольше.', offsetDays: 1 },
    { text: 'Все 5 станков разгружены. Проверяю комплектацию по описи.', offsetDays: 2 },
  ],
  2: [
    { text: 'Инвентаризация завершена. Выявлены расхождения по 12 позициям.', offsetDays: 5 },
    { text: 'Расхождения по линзам и соплам — расход не был списан. Исправляю в системе.', offsetDays: 8 },
  ],
  3: [
    { text: 'Заказ укомплектован. Станок упакован в деревянную обрешётку.', offsetDays: 2 },
    { text: 'Транспортная компания забрала груз. ТТН оформлена.', offsetDays: 5 },
  ],
  4: [
    { text: 'Новый ангар готов к приёму оборудования. Нужно организовать перевозку 8 единиц.', offsetDays: 0 },
    { text: 'Заказал погрузчик на понедельник. Перемещение займёт 2 дня.', offsetDays: 1 },
  ],
  5: [
    { text: 'Начал комплектацию. Станок VMC650 + набор инструмента + СОЖ.', offsetDays: 0 },
    { text: 'Станок готов. Жду подтверждение от менеджера для отгрузки.', offsetDays: 1 },
  ],
  6: [
    { text: 'Расходники приняты: линзы, сопла, ремни, масла. Всё по накладной.', offsetDays: 2 },
    { text: 'Размещено на складе. Карточки товаров обновлены в системе.', offsetDays: 3 },
  ],
};

// ─── DV: Доставки ───────────────────────────────────────────────────────

const DV_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Доставка станка VMC850 в Екатеринбург', status: 'in_transit', data: { destination: 'Екатеринбург' }, createdDaysAgo: 5 },
  { num: 2, title: 'Доставка 3 станков в Нижний Новгород', status: 'planning', data: { destination: 'Нижний Новгород' }, createdDaysAgo: 2 },
  { num: 3, title: 'Доставка запчастей в Краснодар', status: 'delivered', data: { destination: 'Краснодар' }, createdDaysAgo: 15 },
  { num: 4, title: 'Доставка лесопильной линии в Сыктывкар', status: 'problem', data: { destination: 'Сыктывкар' }, createdDaysAgo: 12 },
  { num: 5, title: 'Самовывоз: токарный станок CK6140', status: 'delivered', data: { destination: 'Казань' }, createdDaysAgo: 8 },
  { num: 6, title: 'Доставка листогиба в Новосибирск', status: 'in_transit', data: { destination: 'Новосибирск' }, createdDaysAgo: 4 },
];

const DV_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Груз отправлен транспортной компанией «Деловые Линии». Трек: DL-289471.', offsetDays: 1 },
    { text: 'Груз прошёл Пермь. Ориентировочно прибытие послезавтра.', offsetDays: 3 },
  ],
  2: [
    { text: 'Три станка: 2 токарных CK6140 + 1 фрезерный VMC650. Общий вес ~8 тонн.', offsetDays: 0 },
    { text: 'Запросил варианты у трёх ТК. Ждём предложения по стоимости и срокам.', offsetDays: 1 },
  ],
  3: [
    { text: 'Запчасти доставлены. Клиент подтвердил получение.', offsetDays: 7 },
    { text: 'ТТН подписана, документы в бухгалтерию.', offsetDays: 8 },
  ],
  4: [
    { text: 'Проблема: фура застряла на подъезде к Сыктывкару — размыло дорогу.', offsetDays: 5 },
    { text: 'Водитель ищет объезд. Задержка доставки на 2-3 дня.', offsetDays: 6 },
    { text: 'Связался с клиентом, предупредил о задержке. Клиент в курсе.', offsetDays: 7 },
  ],
  5: [
    { text: 'Клиент приехал на самовывоз. Станок загружен, документы оформлены.', offsetDays: 1 },
  ],
  6: [
    { text: 'Листогиб HPB-100 отправлен через «ПЭК». Вес 4.2 тонны.', offsetDays: 1 },
    { text: 'Груз в пути. По трекингу — сейчас в Омске.', offsetDays: 3 },
  ],
};

// ─── FD: Финансовые документы ───────────────────────────────────────────

const FD_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Счёт №2847 от ООО «МеталлПро»', status: 'approved', data: { doc_type: 'invoice', amount: 4500000 }, createdDaysAgo: 10 },
  { num: 2, title: 'Акт выполненных работ — сервис ТО', status: 'new', data: { doc_type: 'act', amount: 180000 }, createdDaysAgo: 3 },
  { num: 3, title: 'Накладная на поставку запчастей', status: 'paid', data: { doc_type: 'waybill', amount: 340000 }, createdDaysAgo: 20 },
  { num: 4, title: 'Договор на поставку оборудования', status: 'checking', data: { doc_type: 'contract', amount: 12000000 }, createdDaysAgo: 7 },
  { num: 5, title: 'Счёт на рекламу в Яндекс', status: 'approval', data: { doc_type: 'invoice', amount: 250000 }, createdDaysAgo: 5 },
  { num: 6, title: 'Акт сверки с поставщиком', status: 'paid', data: { doc_type: 'act', amount: 0 }, createdDaysAgo: 25 },
  { num: 7, title: 'Счёт за аренду выставочной площади', status: 'new', data: { doc_type: 'invoice', amount: 450000 }, createdDaysAgo: 4 },
  { num: 8, title: 'Счёт за транспортные услуги', status: 'approved', data: { doc_type: 'invoice', amount: 89000 }, createdDaysAgo: 8 },
];

const FD_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Счёт проверен, суммы соответствуют договору. Отправлен на подпись.', offsetDays: 2 },
    { text: 'Директор подписал. Передаю в оплату.', offsetDays: 5 },
  ],
  2: [
    { text: 'Акт получен от сервисного отдела. Нужно проверить перечень работ.', offsetDays: 0 },
    { text: 'Перечень работ сверен с заказ-нарядом. Всё корректно.', offsetDays: 1 },
  ],
  3: [
    { text: 'Накладная подписана обеими сторонами. Оплата проведена.', offsetDays: 5 },
  ],
  4: [
    { text: 'Договор на 12 млн. Юристы проверяют условия.', offsetDays: 1 },
    { text: 'Юридическое заключение получено. Есть замечания по срокам гарантии.', offsetDays: 3 },
    { text: 'Направили правки контрагенту. Ожидаем ответ.', offsetDays: 5 },
  ],
  5: [
    { text: 'Счёт за Яндекс.Директ за январь. Нужно согласование маркетинга.', offsetDays: 1 },
    { text: 'Маркетинг подтвердил расходы. Передаю на согласование директору.', offsetDays: 3 },
  ],
  6: [
    { text: 'Акт сверки подписан. Расхождений нет.', offsetDays: 5 },
  ],
  7: [
    { text: 'Счёт за площадь на выставке «Металлообработка 2026». 450К за 36 кв.м.', offsetDays: 0 },
    { text: 'Нужно одобрение директора. Сумма превышает лимит отдела.', offsetDays: 1 },
  ],
  8: [
    { text: 'Счёт от ТК «Деловые Линии» за доставку в Новосибирск. Одобрен.', offsetDays: 2 },
    { text: 'Включён в график оплат на следующую неделю.', offsetDays: 4 },
  ],
};

// ─── SR: Согласование расходов ──────────────────────────────────────────

const SR_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Закупка офисной мебели', status: 'director', data: { category: 'office', amount: 320000 }, createdDaysAgo: 10 },
  { num: 2, title: 'Командировка на выставку в Москву (3 чел)', status: 'approved', data: { category: 'travel', amount: 180000 }, createdDaysAgo: 20 },
  { num: 3, title: 'Обновление серверного оборудования', status: 'budget_check', data: { category: 'equipment', amount: 450000 }, createdDaysAgo: 6 },
  { num: 4, title: 'Рекламный бюджет Q2 2026', status: 'new', data: { category: 'marketing', amount: 600000 }, createdDaysAgo: 3 },
  { num: 5, title: 'Обучение сотрудников отдела продаж', status: 'paid', data: { category: 'equipment', amount: 95000 }, createdDaysAgo: 35 },
  { num: 6, title: 'Ремонт крыши склада', status: 'rejected', data: { category: 'office', amount: 1200000 }, createdDaysAgo: 15 },
];

const SR_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Заявка на 10 рабочих столов и 10 офисных кресел. КП от поставщика получено.', offsetDays: 1 },
    { text: 'Бюджет проверен — средства есть. Передано директору на подпись.', offsetDays: 4 },
    { text: 'Ожидаем подпись. Директор в командировке до пятницы.', offsetDays: 7 },
  ],
  2: [
    { text: 'Командировка: 3 сотрудника на выставку «Металлообработка 2026» в Москву на 3 дня.', offsetDays: 1 },
    { text: 'Расходы: перелёт 60К, гостиница 75К, суточные 45К. Итого 180К.', offsetDays: 3 },
    { text: 'Одобрено. Билеты и гостиницу бронирует HR.', offsetDays: 8 },
  ],
  3: [
    { text: 'Нужен новый сервер для 1С. Текущий не справляется с нагрузкой.', offsetDays: 1 },
    { text: 'Получили 3 КП. Оптимальный вариант — 450К (Dell PowerEdge T150).', offsetDays: 3 },
    { text: 'Проверяю остаток бюджета на IT. Подождите до среды.', offsetDays: 5 },
  ],
  4: [
    { text: 'Маркетинг запрашивает 600К на Q2: Яндекс.Директ 250К, выставки 200К, контент 150К.', offsetDays: 0 },
    { text: 'Нужно детальное обоснование по каждой статье расходов.', offsetDays: 1 },
  ],
  5: [
    { text: 'Курс «Техника продаж промышленного оборудования». 8 сотрудников, 2 дня.', offsetDays: 2 },
    { text: 'Обучение проведено. Акт и сертификаты получены. Оплата проведена.', offsetDays: 10 },
  ],
  6: [
    { text: 'Крыша протекает в 3 местах. Нужен капитальный ремонт.', offsetDays: 1 },
    { text: 'Директор отклонил — сумма слишком большая. Ищем более бюджетный вариант.', offsetDays: 5 },
    { text: 'Нашли подрядчика на частичный ремонт за 380К. Подаю повторную заявку.', offsetDays: 10 },
  ],
};

// ─── DG: Договоры ───────────────────────────────────────────────────────

const DG_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Договор поставки с «ПромТех»', status: 'active', data: { contract_type: 'supply', counterparty: 'ООО ПромТех' }, createdDaysAgo: 60 },
  { num: 2, title: 'Договор на сервисное обслуживание с «Метком»', status: 'checking', data: { contract_type: 'services', counterparty: 'ООО Метком' }, createdDaysAgo: 12 },
  { num: 3, title: 'NDA с «КитайЭкспорт»', status: 'signed', data: { contract_type: 'nda', counterparty: 'КитайЭкспорт' }, createdDaysAgo: 30 },
  { num: 4, title: 'Договор аренды склада', status: 'active', data: { contract_type: 'lease' }, createdDaysAgo: 90 },
  { num: 5, title: 'Договор с транспортной компанией', status: 'draft', data: { contract_type: 'services', counterparty: 'ТК Деловые Линии' }, createdDaysAgo: 5 },
  { num: 6, title: 'Договор поставки с «НижнекамскНефтехим»', status: 'expired', data: { contract_type: 'supply', counterparty: 'АО НижнекамскНефтехим' }, createdDaysAgo: 180 },
];

const DG_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Договор действует. Следующая поставка по графику — через 2 недели.', offsetDays: 30 },
    { text: 'Получили доп. соглашение на увеличение объёма поставок на 20%.', offsetDays: 45 },
  ],
  2: [
    { text: 'Клиент хочет годовой контракт на ТО: 4 визита, горячая линия, запчасти со скидкой.', offsetDays: 2 },
    { text: 'Шаблон договора подготовлен. На юридической проверке.', offsetDays: 5 },
    { text: 'Юристы просят уточнить ответственность за сроки ремонта.', offsetDays: 8 },
  ],
  3: [
    { text: 'NDA подписан обеими сторонами. Срок действия — 3 года.', offsetDays: 5 },
    { text: 'Скан подписанного NDA загружен в систему.', offsetDays: 7 },
  ],
  4: [
    { text: 'Договор аренды продлён на 2 года. Индексация ставки +5%.', offsetDays: 60 },
  ],
  5: [
    { text: 'Готовлю проект договора с «Деловые Линии» на грузоперевозки.', offsetDays: 1 },
    { text: 'Черновик направлен ТК на рассмотрение. Ожидаем правки.', offsetDays: 3 },
  ],
  6: [
    { text: 'Договор истёк 3 месяца назад. Клиент не выходит на контакт для продления.', offsetDays: 90 },
    { text: 'Менеджер продаж связался с НижнекамскНефтехим. Готовят новый запрос.', offsetDays: 120 },
  ],
};

// ─── VED: ВЭД операции ──────────────────────────────────────────────────

const VED_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Импорт лазерных станков из Китая (10 шт)', status: 'customs', data: { country: 'Китай' }, createdDaysAgo: 25 },
  { num: 2, title: 'Импорт ЧПУ-контроллеров из Японии', status: 'completed', data: { country: 'Япония' }, createdDaysAgo: 60 },
  { num: 3, title: 'Сертификация оборудования для рынка СНГ', status: 'documents', data: { country: 'Казахстан' }, createdDaysAgo: 18 },
  { num: 4, title: 'Таможенное оформление партии токарных станков', status: 'new', data: { country: 'Тайвань' }, createdDaysAgo: 3 },
  { num: 5, title: 'Экспорт запчастей в Узбекистан', status: 'logistics', data: { country: 'Узбекистан' }, createdDaysAgo: 10 },
  { num: 6, title: 'Импорт расходных материалов из Германии', status: 'completed', data: { country: 'Германия' }, createdDaysAgo: 40 },
];

const VED_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Контейнер прибыл в порт Владивостока. Начинаем таможенное оформление.', offsetDays: 10 },
    { text: 'Документы поданы на таможню. Код ТН ВЭД — 8456.10. Пошлина ~10%.', offsetDays: 12 },
    { text: 'Таможня запросила дополнительные сертификаты на лазерное оборудование.', offsetDays: 15 },
    { text: 'Сертификаты предоставлены. Ожидаем выпуск.', offsetDays: 18 },
  ],
  2: [
    { text: 'Контроллеры Fanuc получены. Таможня пройдена без задержек.', offsetDays: 20 },
    { text: 'Товар на складе в Казани. Все документы оформлены.', offsetDays: 30 },
  ],
  3: [
    { text: 'Нужна сертификация для рынка Казахстана (ЕАС). Подбираем аккредитованную лабораторию.', offsetDays: 2 },
    { text: 'Лаборатория выбрана. Документы на сертификацию поданы. Срок — 30 рабочих дней.', offsetDays: 8 },
  ],
  4: [
    { text: 'Партия 5 токарных станков из Тайваня. Контейнер в пути, ETA — через 3 недели.', offsetDays: 0 },
    { text: 'Готовлю пакет документов для таможни: инвойс, упаковочный лист, сертификат происхождения.', offsetDays: 1 },
  ],
  5: [
    { text: 'Экспорт запчастей в Ташкент. Комплект: линзы, сопла, ремни для лазерных станков.', offsetDays: 2 },
    { text: 'Экспортная декларация оформлена. Груз передан в ТК.', offsetDays: 5 },
    { text: 'Груз прошёл границу. Ожидаем подтверждение доставки от клиента.', offsetDays: 8 },
  ],
  6: [
    { text: 'Расходные материалы Trumpf из Германии получены. Всё по спецификации.', offsetDays: 15 },
    { text: 'Оприходовано на складе. Накладная передана в бухгалтерию.', offsetDays: 18 },
  ],
};

// ─── HR: HR и кадры ─────────────────────────────────────────────────────

const HR_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Заявка на отпуск — Грачев М.А.', status: 'approval', data: { hr_type: 'vacation' }, createdDaysAgo: 8 },
  { num: 2, title: 'Приём нового сотрудника в отдел продаж', status: 'in_progress', data: { hr_type: 'hiring' }, createdDaysAgo: 14 },
  { num: 3, title: 'Больничный лист — Кириллов М.', status: 'completed', data: { hr_type: 'sick_leave' }, createdDaysAgo: 20 },
  { num: 4, title: 'Обучение: курсы повышения квалификации', status: 'new', data: { hr_type: 'training' }, createdDaysAgo: 3 },
  { num: 5, title: 'Аттестация сотрудников сервисного отдела', status: 'approval', data: { hr_type: 'training' }, createdDaysAgo: 12 },
  { num: 6, title: 'Увольнение по собственному желанию', status: 'completed', data: { hr_type: 'dismissal' }, createdDaysAgo: 25 },
];

const HR_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Грачев М.А. подал заявление на отпуск с 15 по 28 февраля.', offsetDays: 0 },
    { text: 'Руководитель отдела продаж согласовал. Передаю директору на подпись.', offsetDays: 2 },
    { text: 'Нужно найти замещающего на время отпуска.', offsetDays: 4 },
  ],
  2: [
    { text: 'Открыта вакансия: менеджер по продажам промышленного оборудования.', offsetDays: 0 },
    { text: 'Получено 15 резюме. Отобрали 5 кандидатов для собеседования.', offsetDays: 3 },
    { text: 'Провели 3 собеседования. Один кандидат очень сильный — опыт в станкостроении.', offsetDays: 7 },
    { text: 'Кандидат прошёл тестовое задание. Выходим на оффер.', offsetDays: 10 },
  ],
  3: [
    { text: 'Кириллов М. предоставил больничный лист. Период: 10 дней.', offsetDays: 0 },
    { text: 'Больничный оформлен в 1С. Кириллов вышел на работу.', offsetDays: 12 },
  ],
  4: [
    { text: 'Заявка на курсы повышения квалификации для 3 сервисных инженеров.', offsetDays: 0 },
    { text: 'Нашли подходящий курс: «Обслуживание станков с ЧПУ Fanuc». Стоимость 85К за 3 чел.', offsetDays: 2 },
  ],
  5: [
    { text: 'Аттестация 8 сотрудников сервисного отдела. График составлен.', offsetDays: 2 },
    { text: '5 из 8 аттестованы. Оставшиеся 3 — на следующей неделе.', offsetDays: 7 },
    { text: 'Результаты аттестации на согласовании у директора.', offsetDays: 10 },
  ],
  6: [
    { text: 'Сотрудник подал заявление. Отработка 2 недели.', offsetDays: 0 },
    { text: 'Обходной лист подписан. Расчёт произведён.', offsetDays: 14 },
  ],
};

// ─── TN: Тендеры ────────────────────────────────────────────────────────

const TN_ENTITIES: EntityDef[] = [
  { num: 1, title: 'Тендер: поставка оборудования для «Роснефть»', status: 'submitted', data: { tender_amount: 45000000 }, createdDaysAgo: 20 },
  { num: 2, title: 'Тендер: сервисный контракт «Газпромнефть»', status: 'preparation', data: { tender_amount: 12000000 }, createdDaysAgo: 10 },
  { num: 3, title: 'Тендер: модернизация цеха «КамАЗ»', status: 'won', data: { tender_amount: 28000000 }, createdDaysAgo: 45 },
  { num: 4, title: 'Тендер: поставка станков для «ВСМПО-Ависма»', status: 'search', data: { tender_amount: 67000000 }, createdDaysAgo: 5 },
  { num: 5, title: 'Тендер: сервис для «Казаньоргсинтез»', status: 'lost', data: { tender_amount: 8500000 }, createdDaysAgo: 35 },
  { num: 6, title: 'Тендер: оснащение учебного центра', status: 'review', data: { tender_amount: 15000000 }, createdDaysAgo: 15 },
];

const TN_COMMENTS: Record<number, CommentDef[]> = {
  1: [
    { text: 'Заявка подана на площадке Росатом-закупки. Сумма лота 45 млн.', offsetDays: 5 },
    { text: 'Конкуренты: «Пумори» и «СТАН». Наше преимущество — сроки поставки.', offsetDays: 10 },
    { text: 'Рассмотрение заявок — 1 марта. Ожидаем решение комиссии.', offsetDays: 15 },
  ],
  2: [
    { text: 'Газпромнефть ищет подрядчика на ТО оборудования на 3 года. Готовлю документацию.', offsetDays: 1 },
    { text: 'Нужна выписка из СРО и банковская гарантия на 10% от суммы контракта.', offsetDays: 3 },
    { text: 'Банковская гарантия получена. Осталось собрать технические спецификации.', offsetDays: 7 },
  ],
  3: [
    { text: 'ВЫИГРАЛИ! КамАЗ выбрал нас для модернизации токарного цеха.', offsetDays: 20 },
    { text: 'Подписание контракта через неделю. Готовим график поставок.', offsetDays: 25 },
    { text: 'Контракт подписан. Первая партия оборудования — через 2 месяца.', offsetDays: 30 },
  ],
  4: [
    { text: 'ВСМПО-Ависма опубликовали тендер на 67 млн. Нужны титановые станки.', offsetDays: 0 },
    { text: 'Изучаю ТЗ. Требуется специализированное оборудование для обработки титана.', offsetDays: 2 },
    { text: 'Связался с поставщиком в Японии — могут предложить подходящие станки.', offsetDays: 4 },
  ],
  5: [
    { text: 'Проиграли тендер. Конкурент предложил цену на 12% ниже.', offsetDays: 25 },
    { text: 'Проанализировал причины. Нужно оптимизировать стоимость сервисных контрактов.', offsetDays: 27 },
  ],
  6: [
    { text: 'Тендер на оснащение учебного центра при ВУЗе. Нужны учебные станки.', offsetDays: 2 },
    { text: 'КП подготовлено: 3 токарных, 2 фрезерных, 1 лазерный. Итого 15 млн.', offsetDays: 5 },
    { text: 'Заявка на рассмотрении конкурсной комиссии.', offsetDays: 10 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Карта workspace → данные
// ═══════════════════════════════════════════════════════════════════════════

const ALL_WORKSPACE_DATA: WorkspaceEntities[] = [
  { wsKey: 'zk', prefix: 'ZK', departmentKeys: ['sales'], entities: ZK_ENTITIES, comments: ZK_COMMENTS },
  { wsKey: 'kp', prefix: 'KP', departmentKeys: ['sales'], entities: KP_ENTITIES, comments: KP_COMMENTS },
  { wsKey: 'sz', prefix: 'SZ', departmentKeys: ['service'], entities: SZ_ENTITIES, comments: SZ_COMMENTS },
  { wsKey: 'rek', prefix: 'REK', departmentKeys: ['service'], entities: REK_ENTITIES, comments: REK_COMMENTS },
  { wsKey: 'mk', prefix: 'MK', departmentKeys: ['marketing'], entities: MK_ENTITIES, comments: MK_COMMENTS },
  { wsKey: 'kn', prefix: 'KN', departmentKeys: ['marketing'], entities: KN_ENTITIES, comments: KN_COMMENTS },
  { wsKey: 'sk', prefix: 'SK', departmentKeys: ['warehouse', 'logistics'], entities: SK_ENTITIES, comments: SK_COMMENTS },
  { wsKey: 'dv', prefix: 'DV', departmentKeys: ['logistics', 'warehouse'], entities: DV_ENTITIES, comments: DV_COMMENTS },
  { wsKey: 'fd', prefix: 'FD', departmentKeys: ['accounting', 'financial'], entities: FD_ENTITIES, comments: FD_COMMENTS },
  { wsKey: 'sr', prefix: 'SR', departmentKeys: ['accounting', 'financial', 'admin'], entities: SR_ENTITIES, comments: SR_COMMENTS },
  { wsKey: 'dg', prefix: 'DG', departmentKeys: ['legal'], entities: DG_ENTITIES, comments: DG_COMMENTS },
  { wsKey: 'ved', prefix: 'VED', departmentKeys: ['fea'], entities: VED_ENTITIES, comments: VED_COMMENTS },
  { wsKey: 'hr', prefix: 'HR', departmentKeys: ['hr', 'admin'], entities: HR_ENTITIES, comments: HR_COMMENTS },
  { wsKey: 'tn', prefix: 'TN', departmentKeys: ['tender', 'sales'], entities: TN_ENTITIES, comments: TN_COMMENTS },
];

// ═══════════════════════════════════════════════════════════════════════════
// SeedEntitiesService
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class SeedEntitiesService {
  private readonly logger = new Logger(SeedEntitiesService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepo: Repository<WorkspaceEntity>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
  ) {}

  /**
   * Создать сущности и комментарии для всех workspace кроме IT.
   */
  async createAll(
    ws: SeedWorkspaces,
    users: User[],
  ): Promise<Record<string, WorkspaceEntity[]>> {
    this.logger.log('Создание сущностей и комментариев...');

    // Build user lookup by department
    const byDept = (keys: string[]): User[] =>
      users.filter((u) => {
        const emp = EMPLOYEES.find((e) => e.email === u.email);
        return emp && keys.includes(emp.departmentKey);
      });

    // Workspace key → Workspace entity
    const wsMap: Record<string, { id: string }> = {
      zk: ws.zk,
      kp: ws.kp,
      sz: ws.sz,
      rek: ws.rek,
      mk: ws.mk,
      kn: ws.kn,
      sk: ws.sk,
      dv: ws.dv,
      fd: ws.fd,
      sr: ws.sr,
      dg: ws.dg,
      ved: ws.ved,
      hr: ws.hr,
      tn: ws.tn,
    };

    const result: Record<string, WorkspaceEntity[]> = {};
    let totalEntities = 0;
    let totalComments = 0;

    for (const wsDef of ALL_WORKSPACE_DATA) {
      const workspace = wsMap[wsDef.wsKey];
      if (!workspace) {
        this.logger.warn(`Workspace "${wsDef.wsKey}" не найден, пропускаем`);
        continue;
      }

      const deptUsers = byDept(wsDef.departmentKeys);
      if (deptUsers.length === 0) {
        this.logger.warn(
          `Нет пользователей для workspace "${wsDef.wsKey}" (departments: ${wsDef.departmentKeys.join(', ')})`,
        );
        continue;
      }

      // ─── Create entities ───────────────────────────────────────────────

      const entities: WorkspaceEntity[] = [];

      for (const eDef of wsDef.entities) {
        const assignee = pick(deptUsers);
        const createdAt = daysAgo(eDef.createdDaysAgo);

        // Finished statuses — set resolvedAt
        const finishedStatuses = [
          'completed',
          'done',
          'delivered',
          'shipped',
          'paid',
          'closed',
          'won',
          'lost',
          'rejected',
          'expired',
          'published',
          'ready',
        ];
        let resolvedAt: Date | null = null;
        if (finishedStatuses.includes(eDef.status)) {
          const resolveDaysAgo = Math.max(
            0,
            eDef.createdDaysAgo - Math.floor(3 + Math.random() * 10),
          );
          resolvedAt = daysAgo(resolveDaysAgo);
        }

        const entity = this.entityRepo.create({
          workspaceId: workspace.id,
          customId: `${wsDef.prefix}-${eDef.num}`,
          title: eDef.title,
          status: eDef.status,
          priority: eDef.priority ?? undefined,
          assigneeId: assignee.id,
          data: eDef.data ?? {},
          createdAt,
          updatedAt: resolvedAt ?? daysAgo(Math.max(0, eDef.createdDaysAgo - 1)),
          lastActivityAt:
            resolvedAt ?? daysAgo(Math.max(0, eDef.createdDaysAgo - 1)),
          resolvedAt: resolvedAt ?? undefined,
        });

        entities.push(entity);
      }

      const savedEntities = await this.entityRepo.save(entities);
      result[wsDef.wsKey] = savedEntities;
      totalEntities += savedEntities.length;

      // ─── Create comments ──────────────────────────────────────────────

      const allComments: Comment[] = [];

      for (const entity of savedEntities) {
        const num = parseInt(
          entity.customId.replace(`${wsDef.prefix}-`, ''),
          10,
        );
        const commentDefs = wsDef.comments[num];
        if (!commentDefs) continue;

        for (const cDef of commentDefs) {
          const author = pick(deptUsers);
          const createdAt = new Date(entity.createdAt);
          createdAt.setDate(createdAt.getDate() + cDef.offsetDays);
          createdAt.setHours(9 + Math.floor(Math.random() * 9)); // 9:00 - 17:59
          createdAt.setMinutes(Math.floor(Math.random() * 60));

          const comment = this.commentRepo.create({
            entityId: entity.id,
            authorId: author.id,
            content: cDef.text,
            createdAt,
            updatedAt: createdAt,
          });
          allComments.push(comment);
        }
      }

      // Save comments in chunks
      const chunkSize = 100;
      for (let i = 0; i < allComments.length; i += chunkSize) {
        const chunk = allComments.slice(i, i + chunkSize);
        await this.commentRepo.save(chunk);
      }

      totalComments += allComments.length;
    }

    this.logger.log(
      `Создано: ${totalEntities} сущностей, ${totalComments} комментариев в ${Object.keys(result).length} workspace`,
    );

    return result;
  }
}
