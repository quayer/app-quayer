import { use } from 'react';
import { SharePageContent } from './_share-page';

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <SharePageContent token={token} />;
}
