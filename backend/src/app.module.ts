import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { configuration } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { RequestContextMiddleware } from './context/request-context.middleware';
import { RequestContextModule } from './context/request-context.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: (config) => {
        const validated = validateEnv(config);
        return { ...config, ...validated };
      },
      load: [configuration],
    }),
    RequestContextModule,
    PrismaModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
