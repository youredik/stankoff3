import { Controller, Get, Request } from '@nestjs/common';
import {
  DashboardService,
  DashboardSummaryResponse,
} from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Request() req: any): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary(req.user.id);
  }
}
