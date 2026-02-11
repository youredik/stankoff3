import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './invitation.entity';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { SectionModule } from '../section/section.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invitation]),
    UserModule,
    AuthModule,
    SectionModule,
    WorkspaceModule,
    // RbacModule is @Global, no need to import
  ],
  providers: [InvitationService],
  controllers: [InvitationController],
  exports: [InvitationService],
})
export class InvitationModule {}
