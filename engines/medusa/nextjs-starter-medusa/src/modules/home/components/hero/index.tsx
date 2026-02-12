import { Button, Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="relative w-full overflow-hidden">
      {/* Main Hero */}
      <div
        className="relative h-[85vh] w-full flex items-center justify-center"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1920&q=80)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl gap-6">
          <span className="text-white/80 text-sm tracking-[0.3em] uppercase font-medium">
            Curated for you
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-6xl leading-tight text-white font-light tracking-tight"
          >
            Discover Your
            <br />
            <span className="font-semibold">Signature Style</span>
          </Heading>
          <Text className="text-white/90 text-base small:text-lg max-w-xl leading-relaxed">
            Premium clothing and accessories designed for the modern lifestyle.
            Quality materials, timeless design.
          </Text>
          <div className="flex gap-4 mt-2">
            <LocalizedClientLink href="/store">
              <Button
                variant="secondary"
                className="bg-white text-black hover:bg-white/90 px-8 py-3 text-sm tracking-wide"
              >
                Shop Collection
              </Button>
            </LocalizedClientLink>
            <LocalizedClientLink href="/collections/new-arrivals">
              <Button
                variant="transparent"
                className="border border-white text-white hover:bg-white/10 px-8 py-3 text-sm tracking-wide"
              >
                New Arrivals
              </Button>
            </LocalizedClientLink>
          </div>
        </div>
      </div>

      {/* Feature Strip */}
      <div className="bg-ui-bg-base border-b border-ui-border-base">
        <div className="content-container py-6 grid grid-cols-2 small:grid-cols-4 gap-6 text-center">
          <div className="flex flex-col items-center gap-1">
            <svg
              className="w-6 h-6 text-ui-fg-subtle mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <Text className="text-ui-fg-base text-xs font-medium tracking-wide uppercase">
              Free Shipping
            </Text>
            <Text className="text-ui-fg-muted text-xs">On orders over $50</Text>
          </div>
          <div className="flex flex-col items-center gap-1">
            <svg
              className="w-6 h-6 text-ui-fg-subtle mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <Text className="text-ui-fg-base text-xs font-medium tracking-wide uppercase">
              Quality Guarantee
            </Text>
            <Text className="text-ui-fg-muted text-xs">
              Premium materials only
            </Text>
          </div>
          <div className="flex flex-col items-center gap-1">
            <svg
              className="w-6 h-6 text-ui-fg-subtle mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <Text className="text-ui-fg-base text-xs font-medium tracking-wide uppercase">
              Easy Returns
            </Text>
            <Text className="text-ui-fg-muted text-xs">30-day return policy</Text>
          </div>
          <div className="flex flex-col items-center gap-1">
            <svg
              className="w-6 h-6 text-ui-fg-subtle mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <Text className="text-ui-fg-base text-xs font-medium tracking-wide uppercase">
              Secure Payment
            </Text>
            <Text className="text-ui-fg-muted text-xs">SSL encrypted checkout</Text>
          </div>
        </div>
      </div>

      {/* Category Tiles */}
      <div className="content-container py-16">
        <div className="text-center mb-10">
          <Heading
            level="h2"
            className="text-2xl small:text-3xl font-light text-ui-fg-base"
          >
            Shop by Category
          </Heading>
          <Text className="text-ui-fg-subtle mt-2">
            Find exactly what you&apos;re looking for
          </Text>
        </div>
        <div className="grid grid-cols-2 small:grid-cols-3 gap-4">
          {[
            {
              title: "T-Shirts",
              href: "/categories/t-shirts",
              img: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80",
            },
            {
              title: "Hoodies",
              href: "/categories/hoodies-sweatshirts",
              img: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80",
            },
            {
              title: "Pants",
              href: "/categories/pants-joggers",
              img: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&q=80",
            },
            {
              title: "Dresses",
              href: "/categories/dresses-skirts",
              img: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&q=80",
            },
            {
              title: "Accessories",
              href: "/categories/accessories",
              img: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80",
            },
            {
              title: "Outerwear",
              href: "/categories/jackets-outerwear",
              img: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80",
            },
          ].map((cat) => (
            <LocalizedClientLink
              key={cat.title}
              href={cat.href}
              className="group relative aspect-[4/5] overflow-hidden rounded-large"
            >
              <img
                src={cat.img}
                alt={cat.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <Text className="text-white text-lg font-medium">
                  {cat.title}
                </Text>
                <Text className="text-white/70 text-xs mt-1 group-hover:text-white transition-colors">
                  Shop now &rarr;
                </Text>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Hero
