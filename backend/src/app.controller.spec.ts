import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, ConfigService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should expose health metadata', () => {
      const health = appController.getHealth();
      expect(health.status).toBe('ok');
      expect(typeof health.environment).toBe('string');
      expect(typeof health.timestamp).toBe('string');
    });
  });
});
