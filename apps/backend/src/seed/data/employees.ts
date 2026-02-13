import { UserRole } from '../../modules/user/user.entity';

/**
 * Данные сотрудника для seed
 */
export interface SeedEmployee {
  legacyId: number | null;
  email: string;
  firstName: string;
  lastName: string;
  departmentKey: string;
  role: UserRole;
  specialty?: string;
}

/**
 * 87 реальных сотрудников Stankoff
 * Источник: legacy БД (таблица manager + SS_customers), дата: 2026-02-10
 * + Сергей Коршунов (добавлен вручную — продукт-менеджер портала)
 */
export const EMPLOYEES: SeedEmployee[] = [
  // ═══ Администрация (2) ═══
  { legacyId: 22, email: 'ruslan.stankoff@gmail.com', firstName: 'Руслан', lastName: 'Зиннуров', departmentKey: 'admin', role: UserRole.ADMIN, specialty: 'Директор' },
  { legacyId: 23, email: 'stankoff@mail.ru', firstName: 'Артур', lastName: 'Зиннуров', departmentKey: 'admin', role: UserRole.MANAGER },

  // ═══ Бухгалтерия (5) ═══
  { legacyId: 24, email: 'chulpan@stankoff.ru', firstName: 'Чулпан', lastName: 'Самигуллина', departmentKey: 'accounting', role: UserRole.MANAGER, specialty: 'Главный бухгалтер' },
  { legacyId: 112, email: 'aisylu@stankoff.ru', firstName: 'Айсылу', lastName: 'Валеева', departmentKey: 'accounting', role: UserRole.EMPLOYEE, specialty: 'Бухгалтер' },
  { legacyId: 35, email: 'katya@stankoff.ru', firstName: 'Екатерина', lastName: 'Куприянова', departmentKey: 'accounting', role: UserRole.EMPLOYEE, specialty: 'Бухгалтер' },
  { legacyId: 95, email: 'alina@stankoff.ru', firstName: 'Алина', lastName: 'Платонова', departmentKey: 'accounting', role: UserRole.EMPLOYEE, specialty: 'Бухгалтер' },
  { legacyId: 140, email: 'alina.salakhova@stankoff.ru', firstName: 'Алина', lastName: 'Салахова', departmentKey: 'accounting', role: UserRole.EMPLOYEE, specialty: 'Бухгалтер' },

  // ═══ Логистический отдел (3) ═══
  { legacyId: 4, email: 'ma@stankoff.ru', firstName: 'Артур', lastName: 'Мингазов', departmentKey: 'logistics', role: UserRole.MANAGER, specialty: 'Ведущий специалист отдела логистики' },
  { legacyId: 57, email: 'km@stankoff.ru', firstName: 'Максим', lastName: 'Кириллов', departmentKey: 'logistics', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист отдела логистики' },
  { legacyId: 39, email: 'ssv@stankoff.ru', firstName: 'Сергей', lastName: 'Шуршев', departmentKey: 'logistics', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист отдела логистики' },

  // ═══ Маркетинговый отдел (14) ═══
  { legacyId: 25, email: 'yunona.salimzyanova@yandex.ru', firstName: 'Юнона', lastName: 'Салимзянова', departmentKey: 'marketing', role: UserRole.MANAGER, specialty: 'Специалист отдела маркетинга' },
  { legacyId: 32, email: 'sevil.alieva2020@gmail.com', firstName: 'Севиль', lastName: 'Алиева', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 136, email: 'roman.akhmadullin@stankoff.ru', firstName: 'Роман', lastName: 'Ахмадуллин', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 154, email: 'stanislav.bulatov@stankoff.ru', firstName: 'Станислав', lastName: 'Булатов', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 29, email: 'agavrilenko496@gmail.com', firstName: 'Антон', lastName: 'Гавриленко', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 145, email: 'maria.erosh@stankoff.ru', firstName: 'Мария', lastName: 'Ерош', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 146, email: 'dmitriy.kolosov@stankoff.ru', firstName: 'Дмитрий', lastName: 'Колосов', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 67, email: 'ivan.kuzmin@stankoff.ru', firstName: 'Иван', lastName: 'Кузьмин', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 101, email: 'lubov.mironova@stankoff.ru', firstName: 'Любовь', lastName: 'Миронова', departmentKey: 'marketing', role: UserRole.EMPLOYEE, specialty: 'Контент-менеджер' },
  { legacyId: 107, email: 'oleg.pivovar@stankoff.ru', firstName: 'Олег', lastName: 'Пивовар', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 85, email: 'damir@stankoff.ru', firstName: 'Дамир', lastName: 'Пирмамедов', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 111, email: 'ulyana@stankoff.ru', firstName: 'Ульяна', lastName: 'Попова', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 135, email: 'lyubov.saiko@stankoff.ru', firstName: 'Любовь', lastName: 'Сайко', departmentKey: 'marketing', role: UserRole.EMPLOYEE },
  { legacyId: 147, email: 'timur.khairtdinov@stankoff.ru', firstName: 'Тимур', lastName: 'Хайртдинов', departmentKey: 'marketing', role: UserRole.EMPLOYEE },

  // ═══ Отдел HR (1) ═══
  { legacyId: 132, email: 'anna.sidorova@stankoff.ru', firstName: 'Анна', lastName: 'Сидорова', departmentKey: 'hr', role: UserRole.MANAGER },

  // ═══ Отдел ВЭД (4) ═══
  { legacyId: 14, email: 'ildar@stankoff.ru', firstName: 'Ильдар', lastName: 'Низамиев', departmentKey: 'fea', role: UserRole.MANAGER },
  { legacyId: 97, email: 'elvira@stankoff.ru', firstName: 'Эльвира', lastName: 'Газимова', departmentKey: 'fea', role: UserRole.EMPLOYEE },
  { legacyId: 70, email: 'aleksandr@stankoff.ru', firstName: 'Александр', lastName: 'Плошков', departmentKey: 'fea', role: UserRole.EMPLOYEE },
  { legacyId: 49, email: 'chitra@stankoff.ru', firstName: 'Читра', lastName: 'Тхомпира', departmentKey: 'fea', role: UserRole.EMPLOYEE },

  // ═══ IT отдел (2) ═══
  { legacyId: 148, email: 'youredik@gmail.com', firstName: 'Эдуард', lastName: 'Сарваров', departmentKey: 'it', role: UserRole.ADMIN },
  { legacyId: null, email: 's.korshunov88@ya.ru', firstName: 'Сергей', lastName: 'Коршунов', departmentKey: 'it', role: UserRole.ADMIN, specialty: 'Продукт-менеджер' },

  // ═══ Отдел продаж (29) ═══
  { legacyId: 1, email: 'grachev@stankoff.ru', firstName: 'Максим', lastName: 'Грачев', departmentKey: 'sales', role: UserRole.MANAGER, specialty: 'Ведущий специалист по фрезерным и лазерным станкам с ЧПУ' },
  { legacyId: 7, email: 'rsv@stankoff.ru', firstName: 'Сергей', lastName: 'Русских', departmentKey: 'sales', role: UserRole.MANAGER, specialty: 'Ведущий специалист по лесопильному оборудованию' },
  { legacyId: 5, email: 'af@stankoff.ru', firstName: 'Артур', lastName: 'Ахметзянов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по полимерному оборудованию' },
  { legacyId: 16, email: 'alex@stankoff.ru', firstName: 'Алексей', lastName: 'Булыгин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },
  { legacyId: 68, email: 'nikolai@stankoff.ru', firstName: 'Николай', lastName: 'Васильев', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },
  { legacyId: 36, email: 'renat@stankoff.ru', firstName: 'Ренат', lastName: 'Гарифьянов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по столярным станкам' },
  { legacyId: 53, email: 'azat@stankoff.ru', firstName: 'Азат', lastName: 'Гатауллин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по термопластавтоматам' },
  { legacyId: 50, email: 'dinar.gataullin@stankoff.ru', firstName: 'Динар', lastName: 'Гатауллин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 120, email: 'ilya.dolgushin@stankoff.ru', firstName: 'Илья', lastName: 'Долгушин', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 63, email: 'albert.zaripov@stankoff.ru', firstName: 'Альберт', lastName: 'Зарипов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },
  { legacyId: 119, email: 'a.mutokhlyaev@composit-group.com', firstName: 'Артем', lastName: 'Иванов', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 86, email: 'azat.kalimullin@stankoff.ru', firstName: 'Азат', lastName: 'Калимуллин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 130, email: 'ravil.kamalutdinov@stankoff.ru', firstName: 'Равиль', lastName: 'Камалутдинов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по запчастям и расходным материалам' },
  { legacyId: 69, email: 'danil@stankoff.ru', firstName: 'Данил', lastName: 'Киряшин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 117, email: 'roman.koksharov@stankoff.ru', firstName: 'Роман', lastName: 'Кокшаров', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 116, email: 'maksim.mazhorov@stankoff.ru', firstName: 'Максим', lastName: 'Мажоров', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 150, email: 'svechkin@gmail.com', firstName: 'Дмитрий', lastName: 'Морозов', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 56, email: 'natalya@stankoff.ru', firstName: 'Наталья', lastName: 'Низамова', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по запчастям и расходным материалам' },
  { legacyId: 139, email: 'maksim.nikitin@stankoff.ru', firstName: 'Максим', lastName: 'Никитин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },
  { legacyId: 151, email: 'ortinskayamariya@gmail.com', firstName: 'Мария', lastName: 'Ортынская', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 31, email: 'ilnur@stankoff.ru', firstName: 'Ильнур', lastName: 'Сафин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 59, email: 'oleg@stankoff.ru', firstName: 'Олег', lastName: 'Селезнев', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по фрезерным и лазерным станкам с ЧПУ' },
  { legacyId: 138, email: 'nikita.serov@stankoff.ru', firstName: 'Никита', lastName: 'Серов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },
  { legacyId: 21, email: 'artem@stankoff.ru', firstName: 'Артём', lastName: 'Третьяков', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по фрезерным и лазерным станкам с ЧПУ' },
  { legacyId: 15, email: 'dinar@stankoff.ru', firstName: 'Динар', lastName: 'Фасхутдинов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по столярным станкам' },
  { legacyId: 118, email: 'elina.khazgalieva@stankoff.ru', firstName: 'Элина', lastName: 'Хазгалиева', departmentKey: 'sales', role: UserRole.EMPLOYEE },
  { legacyId: 6, email: 'albert@stankoff.ru', firstName: 'Альберт', lastName: 'Шайхуллин', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по металлообрабатывающему оборудованию' },
  { legacyId: 2, email: 'ali@stankoff.ru', firstName: 'Али', lastName: 'Шарафутдинов', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по столярным станкам' },
  { legacyId: 3, email: 'margo@stankoff.ru', firstName: 'Маргарита', lastName: 'Якупова', departmentKey: 'sales', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по оптоволоконным лазерным станкам' },

  // ═══ Сервисный отдел (16) ═══
  { legacyId: 18, email: 'andrey@stankoff.ru', firstName: 'Андрей', lastName: 'Кяшкин', departmentKey: 'service', role: UserRole.MANAGER, specialty: 'Технический директор' },
  { legacyId: 87, email: 'dmitriy.myslyuk@stankoff.ru', firstName: 'Дмитрий', lastName: 'Мыслюк', departmentKey: 'service', role: UserRole.MANAGER, specialty: 'Руководитель сервисного отдела' },
  { legacyId: 88, email: 'rustam.gilyazev@stankoff.ru', firstName: 'Рустам', lastName: 'Гилязев', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Инженер экспозиционного центра' },
  { legacyId: 80, email: 'maksim.grushin@stankoff.ru', firstName: 'Максим', lastName: 'Грушин', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 103, email: 'ivan.egorov@stankoff.ru', firstName: 'Иван', lastName: 'Егоров', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 90, email: 'ildar.zamoltdinov@stankoff.ru', firstName: 'Ильдар', lastName: 'Замолтдинов', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 44, email: 'vladimir@stankoff.ru', firstName: 'Владимир', lastName: 'Камонин', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Руководитель производственно-технического отдела' },
  { legacyId: 144, email: 'viktor.karasev@stankoff.ru', firstName: 'Виктор', lastName: 'Карасёв', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Инженер технической поддержки' },
  { legacyId: 124, email: 'anastasia.karyukhina@stankoff.ru', firstName: 'Анастасия', lastName: 'Карюхина', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист рекламационного отдела' },
  { legacyId: 127, email: 'igor.kokorev@stankoff.ru', firstName: 'Игорь', lastName: 'Кокорев', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 65, email: 'dmitry@stankoff.ru', firstName: 'Дмитрий', lastName: 'Леванов', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 89, email: 'sergey.mavrin@stankoff.ru', firstName: 'Сергей', lastName: 'Маврин', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Инженер технической поддержки' },
  { legacyId: 64, email: 'amir@stankoff.ru', firstName: 'Амир', lastName: 'Мифтахов', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист по обеспечению сервисных работ' },
  { legacyId: 77, email: 'dmitriy.plehov@stankoff.ru', firstName: 'Дмитрий', lastName: 'Плехов', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Сервисный инженер' },
  { legacyId: 149, email: 'tatyana.salakhudinova@stankoff.ru', firstName: 'Татьяна', lastName: 'Салахудинова', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Менеджер по сопровождению сервисных услуг' },
  { legacyId: 125, email: 'oksana.shigabutdinova@stankoff.ru', firstName: 'Оксана', lastName: 'Шигабутдинова', departmentKey: 'service', role: UserRole.EMPLOYEE, specialty: 'Ведущий специалист рекламационного отдела' },

  // ═══ Склад (5) ═══
  { legacyId: 113, email: 'lenar@stankoff.ru', firstName: 'Ленар', lastName: 'Сайфутдинов', departmentKey: 'warehouse', role: UserRole.MANAGER },
  { legacyId: 152, email: 'ildus.garafiev@stankoff.ru', firstName: 'Ильдус', lastName: 'Гарафиев', departmentKey: 'warehouse', role: UserRole.EMPLOYEE },
  { legacyId: 153, email: 'aleksei.komin@stankoff.ru', firstName: 'Алексей', lastName: 'Комин', departmentKey: 'warehouse', role: UserRole.EMPLOYEE },
  { legacyId: 79, email: 'eduard@stankoff.ru', firstName: 'Эдуард', lastName: 'Смирнов', departmentKey: 'warehouse', role: UserRole.EMPLOYEE },
  { legacyId: 141, email: 'ramzis.khakimov@stankoff.ru', firstName: 'Рамзис', lastName: 'Хакимов', departmentKey: 'warehouse', role: UserRole.EMPLOYEE },

  // ═══ Тендерный отдел (1) ═══
  { legacyId: 122, email: 'ivan.leontiev@stankoff.ru', firstName: 'Иван', lastName: 'Леонтьев', departmentKey: 'tender', role: UserRole.MANAGER },

  // ═══ Финансовый отдел (1) ═══
  { legacyId: 100, email: 'aleksei.matveev@stankoff.ru', firstName: 'Алексей', lastName: 'Матвеев', departmentKey: 'financial', role: UserRole.MANAGER },

  // ═══ Юридический отдел (3) ═══
  { legacyId: 55, email: 'chulpan.gallyamova@stankoff.ru', firstName: 'Чулпан', lastName: 'Галлямова', departmentKey: 'legal', role: UserRole.MANAGER, specialty: 'Ведущий юрисконсульт' },
  { legacyId: 137, email: 't.dotcenko@gmail.com', firstName: 'Тарас', lastName: 'Доценко', departmentKey: 'legal', role: UserRole.EMPLOYEE },
  { legacyId: 129, email: 'robert.safiullin@stankoff.ru', firstName: 'Роберт', lastName: 'Сафиуллин', departmentKey: 'legal', role: UserRole.EMPLOYEE },

  // ═══ Без отдела (1) ═══
  { legacyId: 105, email: 'anastasia.elizarova@stankoff.ru', firstName: 'Анастасия', lastName: 'Елизарова', departmentKey: 'admin', role: UserRole.EMPLOYEE, specialty: 'Офис-менеджер' },
];
