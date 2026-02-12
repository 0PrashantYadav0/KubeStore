import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { Text, clx } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function Footer() {
  const { collections } = await listCollections({
    fields: "*products",
  })
  const productCategories = await listCategories()

  return (
    <footer className="border-t border-ui-border-base w-full bg-ui-bg-base">
      <div className="content-container flex flex-col w-full">
        {/* Newsletter */}
        <div className="py-12 border-b border-ui-border-base flex flex-col small:flex-row items-start small:items-center justify-between gap-6">
          <div>
            <Text className="txt-xlarge font-semibold text-ui-fg-base">
              Stay in the Loop
            </Text>
            <Text className="text-ui-fg-subtle text-sm mt-1">
              Subscribe for early access to new arrivals, sales, and style
              guides.
            </Text>
          </div>
          <div className="flex gap-2 w-full small:w-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="border border-ui-border-base rounded-full px-5 py-2.5 text-sm flex-1 small:w-64 focus:outline-none focus:border-ui-fg-base transition-colors bg-transparent"
            />
            <button className="bg-ui-fg-base text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-ui-fg-subtle transition-colors whitespace-nowrap">
              Subscribe
            </button>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-col gap-y-6 xsmall:flex-row items-start justify-between py-16">
          <div className="flex flex-col gap-3">
            <LocalizedClientLink
              href="/"
              className="flex items-center gap-2 txt-compact-xlarge-plus text-ui-fg-base uppercase tracking-wider font-semibold"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              KubeStore
            </LocalizedClientLink>
            <Text className="text-ui-fg-muted text-sm max-w-xs leading-relaxed">
              Premium clothing and accessories. Quality materials, timeless
              design, delivered worldwide.
            </Text>
          </div>

          <div className="text-small-regular gap-10 md:gap-x-16 grid grid-cols-2 sm:grid-cols-3">
            {productCategories && productCategories?.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="txt-small-plus txt-ui-fg-base font-semibold uppercase tracking-wide text-xs">
                  Categories
                </span>
                <ul
                  className="grid grid-cols-1 gap-2"
                  data-testid="footer-categories"
                >
                  {productCategories?.slice(0, 6).map((c) => {
                    if (c.parent_category) {
                      return
                    }

                    const children =
                      c.category_children?.map((child) => ({
                        name: child.name,
                        handle: child.handle,
                        id: child.id,
                      })) || null

                    return (
                      <li
                        className="flex flex-col gap-y-2 text-ui-fg-subtle txt-small"
                        key={c.id}
                      >
                        <LocalizedClientLink
                          className={clx(
                            "hover:text-ui-fg-base transition-colors",
                            children && "txt-small-plus"
                          )}
                          href={`/categories/${c.handle}`}
                          data-testid="category-link"
                        >
                          {c.name}
                        </LocalizedClientLink>
                        {children && (
                          <ul className="grid grid-cols-1 ml-3 gap-2">
                            {children &&
                              children.map((child) => (
                                <li key={child.id}>
                                  <LocalizedClientLink
                                    className="hover:text-ui-fg-base transition-colors"
                                    href={`/categories/${child.handle}`}
                                    data-testid="category-link"
                                  >
                                    {child.name}
                                  </LocalizedClientLink>
                                </li>
                              ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {collections && collections.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="txt-small-plus txt-ui-fg-base font-semibold uppercase tracking-wide text-xs">
                  Collections
                </span>
                <ul
                  className={clx(
                    "grid grid-cols-1 gap-2 text-ui-fg-subtle txt-small",
                    {
                      "grid-cols-2": (collections?.length || 0) > 3,
                    }
                  )}
                >
                  {collections?.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-ui-fg-base transition-colors"
                        href={`/collections/${c.handle}`}
                      >
                        {c.title}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-y-2">
              <span className="txt-small-plus txt-ui-fg-base font-semibold uppercase tracking-wide text-xs">
                Company
              </span>
              <ul className="grid grid-cols-1 gap-y-2 text-ui-fg-subtle txt-small">
                <li>
                  <LocalizedClientLink
                    href="/store"
                    className="hover:text-ui-fg-base transition-colors"
                  >
                    All Products
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account"
                    className="hover:text-ui-fg-base transition-colors"
                  >
                    My Account
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/cart"
                    className="hover:text-ui-fg-base transition-colors"
                  >
                    Shopping Cart
                  </LocalizedClientLink>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex w-full mb-16 justify-between text-ui-fg-muted border-t border-ui-border-base pt-6">
          <Text className="txt-compact-small">
            &copy; {new Date().getFullYear()} KubeStore. All rights reserved.
          </Text>
          <Text className="txt-compact-small">
            Powered by KubeStore Platform
          </Text>
        </div>
      </div>
    </footer>
  )
}
