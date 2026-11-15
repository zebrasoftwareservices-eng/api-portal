// SPDX-License-Identifier: Apache-2.0
import { SearchResults } from '../../components/search-results';
export default function Loading() {
  return <SearchResults term="" initial={{ kind: 'loading' }} />;
}
