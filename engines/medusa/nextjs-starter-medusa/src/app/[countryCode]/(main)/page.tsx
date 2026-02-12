import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "KubeStore | Modern E-Commerce",
  description:
    "Premium clothing and accessories. Shop curated collections of timeless essentials delivered worldwide.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  if (!collections || !region) {
    return null
  }

  return (
    <>
      <Hero />

      {/* Featured Collections */}
      <div className="py-16 bg-ui-bg-base">
        <div className="content-container">
          <div className="text-center mb-12">
            <Heading
              level="h2"
              className="text-2xl small:text-3xl font-light text-ui-fg-base"
            >
              Featured Collections
            </Heading>
            <Text className="text-ui-fg-subtle mt-2">
              Handpicked selections for every occasion
            </Text>
          </div>
        </div>
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>

      {/* Promo Banner */}
      <div
        className="relative py-24"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1445205170230-053b83016050?w=1920&q=80)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 content-container text-center">
          <Heading
            level="h2"
            className="text-3xl small:text-4xl text-white font-light mb-4"
          >
            New Season, New Styles
          </Heading>
          <Text className="text-white/80 text-lg mb-8 max-w-lg mx-auto">
            Explore our latest arrivals and find pieces that define your
            personal style.
          </Text>
          <LocalizedClientLink
            href="/store"
            className="inline-block bg-white text-black px-10 py-3 text-sm tracking-wide uppercase font-medium hover:bg-white/90 transition-colors rounded-full"
          >
            Explore All Products
          </LocalizedClientLink>
        </div>
      </div>
    </>
  )
}
