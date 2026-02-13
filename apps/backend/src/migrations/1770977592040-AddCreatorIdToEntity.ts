import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreatorIdToEntity1770977592040 implements MigrationInterface {
    name = 'AddCreatorIdToEntity1770977592040'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "entities" ADD "creatorId" uuid`);
        await queryRunner.query(`ALTER TABLE "entities" ADD CONSTRAINT "FK_52c28337f840927af8eeed8340f" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "entities" DROP CONSTRAINT "FK_52c28337f840927af8eeed8340f"`);
        await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN "creatorId"`);
    }

}
