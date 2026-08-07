import { SeoHead } from './SeoHead';

/** noindex head for authenticated app and admin shells. */
export function NoIndexHead({ title, path }: { title: string; path: string }) {
  return (
    <SeoHead
      title={title}
      description="Cosmo account area — sign in required."
      path={path}
      robots="noindex,nofollow"
    />
  );
}
