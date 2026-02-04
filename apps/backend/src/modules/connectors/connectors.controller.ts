import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  /**
   * Получить список всех доступных коннекторов
   */
  @Get()
  getConnectors() {
    return this.connectorsService.getAllConnectors();
  }

  /**
   * Получить информацию о конкретном коннекторе
   */
  @Get(':type')
  getConnector(@Param('type') type: string) {
    const connector = this.connectorsService.getConnector(type);

    if (!connector) {
      return { error: 'Connector not found' };
    }

    return {
      type: connector.type,
      name: connector.name,
      description: connector.description,
      configSchema: connector.configSchema,
      inputSchema: connector.inputSchema,
      outputSchema: connector.outputSchema,
    };
  }

  /**
   * Тестовое выполнение коннектора
   * Позволяет проверить работу коннектора перед использованием в BPMN
   */
  @Post(':type/test')
  @HttpCode(HttpStatus.OK)
  async testConnector(
    @Param('type') type: string,
    @Body()
    body: {
      input: Record<string, unknown>;
      variables?: Record<string, unknown>;
    },
  ) {
    const result = await this.connectorsService.executeConnector(type, body.input, {
      variables: body.variables,
    });

    return result;
  }

  /**
   * Валидация конфигурации коннектора
   */
  @Post(':type/validate')
  @HttpCode(HttpStatus.OK)
  async validateConnector(
    @Param('type') type: string,
    @Body() config: Record<string, unknown>,
  ) {
    return this.connectorsService.validateConnector(type, config);
  }
}
