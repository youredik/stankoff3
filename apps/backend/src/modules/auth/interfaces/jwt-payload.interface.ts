import { UserRole } from '../../user/user.entity';

export interface JwtPayload {
  sub: string; // user.id
  email: string;
  role: UserRole;
}
