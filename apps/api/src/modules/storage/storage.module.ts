import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '../../config/config.service';
import { StorageController } from './api/storage.controller';
import { StorageService } from './application/storage.service';
import type { StorageProvider } from './domain/ports/storage-provider.port';
import { AliOssStorageProvider } from './infrastructure/alioss-storage.provider';
import { S3StorageProvider } from './infrastructure/s3-storage.provider';
import { TencentCosStorageProvider } from './infrastructure/tencentcos-storage.provider';

@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {
  static register(): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: 'STORAGE_PROVIDERS',
          useFactory: (configService: ConfigService) => {
            const storageConfig = configService.getStorageConfig();
            const providers: Record<string, StorageProvider> = {
              // 默认始终包含S3Provider
              s3: new S3StorageProvider(configService),
            };

            // 根据配置注入其他提供商
            if (storageConfig.provider === 'alioss') {
              providers.alioss = new AliOssStorageProvider(configService);
            }

            if (storageConfig.provider === 'tencentoss') {
              providers.tencentoss = new TencentCosStorageProvider(configService);
            }

            return providers;
          },
          inject: [ConfigService],
        },
        StorageService,
      ],
    };
  }
}
