import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

// https://github.com/mscdex/busboy/issues/20
// https://github.com/expressjs/multer/issues/1104
@Injectable()
export class FileNameEncodePipe implements PipeTransform {
  transform(values: Express.Multer.File[], metadata: ArgumentMetadata) {
    if (Array.isArray(values)) {
      return [...values].map((value) => {
        if (!/[^\u0000-\u00ff]/.test(value.originalname)) {
          value.originalname = Buffer.from(
            value.originalname,
            'latin1',
          ).toString('utf8');
        }
        return value;
      });
    }

    return values;
  }
}
