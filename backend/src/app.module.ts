import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { RequestContextMiddleware } from './context/request-context.middleware';
import { RequestContextModule } from './context/request-context.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { LeadsModule } from './leads/leads.module';
import { ContactsModule } from './contacts/contacts.module';
import { PropertiesModule } from './properties/properties.module';
import { EstimatesModule } from './estimates/estimates.module';
import { JobsModule } from './jobs/jobs.module';
import { TasksModule } from './tasks/tasks.module';

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
    LeadsModule,
    ContactsModule,
    PropertiesModule,
    EstimatesModule,
    JobsModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
