import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from '../user/user.module';
import { S3Module } from '../s3/s3.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { KeycloakService } from './keycloak.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { DevAuthController } from './dev-auth.controller';

@Module({
  imports: [
    UserModule,
    S3Module,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    KeycloakService,
    KeycloakAdminService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  controllers: [AuthController, DevAuthController],
  exports: [AuthService, KeycloakService, KeycloakAdminService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
