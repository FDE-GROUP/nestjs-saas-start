// @vitest-environment jsdom
import type { components } from '@saas/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UploadResultPanel } from './settings.storage';

type StoredFile = components['schemas']['FileUploadResultDto'];

afterEach(() => cleanup());

const result: StoredFile = {
  key: 'uploads/2026/abc.png',
  url: 'https://cdn.example.com/uploads/2026/abc.png',
  etag: '"e-tag-value"',
  size: 204800,
  mimetype: 'image/png',
  originalname: 'abc.png',
};

describe('UploadResultPanel（纯展示·typed 契约锁）', () => {
  it('渲染 originalname / key / size / mimetype 与访问 URL', () => {
    render(<UploadResultPanel result={result} />);
    // 文件名 / key / 大小（带单位）/ 类型原样现形。
    expect(screen.getByText('abc.png')).toBeTruthy();
    expect(screen.getByText('uploads/2026/abc.png')).toBeTruthy();
    expect(screen.getByText('204800 字节')).toBeTruthy();
    expect(screen.getByText('image/png')).toBeTruthy();
    // 访问 URL 锚点 href 锁定契约 url 字段。
    const link = screen.getByText('https://cdn.example.com/uploads/2026/abc.png');
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe(result.url);
  });

  it('传入 signedUrl 时附现签名 URL 锚点，缺省不渲染该行', () => {
    const { unmount } = render(
      <UploadResultPanel result={result} signedUrl="https://signed.example/x" />,
    );
    expect(screen.getByText('https://signed.example/x')).toBeTruthy();
    unmount();

    render(<UploadResultPanel result={result} />);
    expect(screen.queryByText('https://signed.example/x')).toBeNull();
  });
});
