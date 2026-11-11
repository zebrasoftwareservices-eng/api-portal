// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ProductDescription } from './product-description';
it('renders description Markdown on the server without allowing active HTML or unsafe links', () => {
  const { container } = render(
    <ProductDescription
      text={
        '# About\n\n**Orders** and `returns`\n\n- [Docs](/apis/orders)\n- [Unsafe](javascript:alert)\n\n<script>alert(1)</script>\n\n```ts\nconst key = "example";\n```'
      }
    />,
  );
  expect(
    screen.getByRole('heading', { name: 'About', level: 2 }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    '/apis/orders',
  );
  expect(
    screen.queryByRole('link', { name: 'Unsafe' }),
  ).not.toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('strong')).toHaveTextContent('Orders');
  expect(container.querySelector('pre')).toHaveTextContent('const key');
});
