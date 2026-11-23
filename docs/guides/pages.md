# Pages and navigation

An admin writes guides and other pages in **Admin → Pages**, and chooses the header and footer links in **Admin → Navigation**. Readers see a published page at `/pages/{slug}`. Nothing is saved until an admin creates a page or saves the navigation, and until then the portal looks as it did before.

## Pages

**New page** starts a draft. The slug follows the title until you edit it. **Save draft** keeps it private: `/pages/{slug}` answers “Page not found” to everyone, including admins. **Preview** opens the last save in the portal’s theme. **Publish** makes that save live on the next page load. There is no rebuild.

**Save changes** on a published page is live at once. Changing the slug makes the old address answer “Page not found”. Header and footer links follow the page.

**Who can read this page** is **Public** or **Signed-in only**. A signed-out visitor who opens a signed-in-only page gets the same “Page not found” page as for a missing address, with **Sign in**. After signing in they return to that address. Drafts and signed-in-only pages are left out of search and out of the header and footer for anyone who cannot read them.

The body is Markdown. HTML tags are removed, so a `<script>` tag, an iframe or an `onerror` attribute is not shown. Links may be `http`, `https` or `mailto`. Images have to be `https` addresses; the portal does not upload images. The optional description is the search snippet, the meta description and the link-preview description. Leave the search-engine title empty to use the page title. Leave the image empty to send no image.

**Unpublish** asks first only when a header or footer link points at the page, and it names each link. **Delete page** always asks, and names those links too. Deleting or unpublishing removes the link and makes the address answer “Page not found”.

## Navigation

Each area is one list. **Add page link** and **Add external link** add a row at the end. External addresses have to be `https`. **Show** hides a built-in without deleting it. **Move up** and **Move down** change the order. **Save navigation** does nothing when there are no changes, so an untouched portal never stores a navigation row. **Reset to default** puts the header back to APIs and My apps and removes footer links. Pages themselves stay.

Sign in, Sign up, search and the account menu stay after the header links. They cannot be hidden or moved. **My apps** is shown only to a signed-in developer. An admin sees saved header links on public pages from a wide window, and never inside **Admin**. Footer links are also left out of the admin area. With the default navigation, the admin top bar is unchanged.

More than four header links for a visitor show the first three and the rest under **More**.
