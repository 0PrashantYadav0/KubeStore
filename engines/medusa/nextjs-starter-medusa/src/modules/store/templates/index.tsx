import { Suspense } from "react"
import { Heading, Text } from "@medusajs/ui"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <>
      {/* Store Banner */}
      <div className="bg-ui-bg-subtle border-b border-ui-border-base">
        <div className="content-container py-12 text-center">
          <Heading
            level="h1"
            className="text-3xl font-light text-ui-fg-base"
            data-testid="store-page-title"
          >
            All Products
          </Heading>
          <Text className="text-ui-fg-subtle mt-2 max-w-md mx-auto">
            Browse our complete collection of premium clothing and accessories
          </Text>
        </div>
      </div>

      <div
        className="flex flex-col small:flex-row small:items-start py-8 content-container gap-8"
        data-testid="category-container"
      >
        <RefinementList sortBy={sort} />
        <div className="w-full">
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
            />
          </Suspense>
        </div>
      </div>
    </>
  )
}

export default StoreTemplate
