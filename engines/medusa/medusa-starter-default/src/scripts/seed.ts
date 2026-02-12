import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
  createCollectionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { ApiKey } from "../../.medusa/types/query-entry-points";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);
  const productModuleService = container.resolve(Modules.PRODUCT);

  const countries = ["gb", "de", "dk", "se", "fr", "es", "it", "us"];

  // ── Idempotency guard: skip if products already exist ──
  const existingProducts = await productModuleService.listProducts(
    {},
    { take: 1 }
  );
  if (existingProducts.length > 0) {
    logger.info("Seed data already exists — skipping.");
    return;
  }

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "eur",
          is_default: true,
        },
        {
          currency_code: "usd",
        },
        {
          currency_code: "gbp",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });

  // ── Regions (idempotent: check if regions already exist) ──
  logger.info("Seeding region data...");
  const existingRegions = await regionModuleService.listRegions();
  let region: { id: string };

  if (existingRegions.length > 0) {
    logger.info("Regions already exist — skipping region creation.");
    region = existingRegions[0];
  } else {
    const { result: regionResult } = await createRegionsWorkflow(
      container
    ).run({
      input: {
        regions: [
          {
            name: "Europe",
            currency_code: "eur",
            countries: ["gb", "de", "dk", "se", "fr", "es", "it"],
            payment_providers: ["pp_system_default"],
          },
          {
            name: "North America",
            currency_code: "usd",
            countries: ["us"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];
    logger.info("Finished seeding regions.");
  }

  // ── Tax Regions (idempotent: wrap in try-catch) ──
  logger.info("Seeding tax regions...");
  try {
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
    logger.info("Finished seeding tax regions.");
  } catch (e: any) {
    logger.info("Tax regions already exist or partially seeded — skipping.");
  }

  // ── Stock Location ──
  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Main Warehouse",
          address: {
            city: "Copenhagen",
            country_code: "DK",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    });
  } catch (e: any) {
    logger.info("Stock-location/fulfillment link already exists — skipping.");
  }

  // ── Fulfillment ──
  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Main Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Worldwide",
        geo_zones: countries.map((cc) => ({
          country_code: cc,
          type: "country" as const,
        })),
      },
    ],
  });

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });
  } catch (e: any) {
    logger.info(
      "Stock-location/fulfillment-set link already exists — skipping."
    );
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivered in 3-5 business days.",
          code: "standard",
        },
        prices: [
          { currency_code: "usd", amount: 5 },
          { currency_code: "eur", amount: 5 },
          { currency_code: "gbp", amount: 4 },
          { region_id: region.id, amount: 5 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Delivered in 1-2 business days.",
          code: "express",
        },
        prices: [
          { currency_code: "usd", amount: 15 },
          { currency_code: "eur", amount: 13 },
          { currency_code: "gbp", amount: 12 },
          { region_id: region.id, amount: 13 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  // ── Publishable API Key ──
  logger.info("Seeding publishable API key data...");
  let publishableApiKey: ApiKey | null = null;
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: {
      type: "publishable",
    },
  });

  publishableApiKey = data?.[0];

  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Webshop",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
  }

  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel[0].id],
      },
    });
  } catch (e: any) {
    logger.info("Sales channel already linked to API key — skipping.");
  }
  logger.info("Finished seeding publishable API key data.");

  // ── Collections ──
  logger.info("Seeding collections...");
  const { result: collectionResult } = await createCollectionsWorkflow(
    container
  ).run({
    input: {
      collections: [
        {
          title: "New Arrivals",
          handle: "new-arrivals",
        },
        {
          title: "Best Sellers",
          handle: "best-sellers",
        },
        {
          title: "Summer Essentials",
          handle: "summer-essentials",
        },
      ],
    },
  });
  const newArrivals = collectionResult.find(
    (c) => c.handle === "new-arrivals"
  )!;
  const bestSellers = collectionResult.find(
    (c) => c.handle === "best-sellers"
  )!;
  const summerEssentials = collectionResult.find(
    (c) => c.handle === "summer-essentials"
  )!;
  logger.info("Finished seeding collections.");

  // ── Categories ──
  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        { name: "T-Shirts", is_active: true },
        { name: "Hoodies & Sweatshirts", is_active: true },
        { name: "Pants & Joggers", is_active: true },
        { name: "Accessories", is_active: true },
        { name: "Jackets & Outerwear", is_active: true },
        { name: "Dresses & Skirts", is_active: true },
      ],
    },
  });

  const cat = (name: string) =>
    categoryResult.find((c) => c.name === name)!.id;

  // Helper for size-only variants
  const sizeVariants = (prefix: string, eurPrice: number, usdPrice: number) =>
    ["S", "M", "L", "XL"].map((size) => ({
      title: size,
      sku: `${prefix}-${size}`,
      options: { Size: size },
      prices: [
        { amount: eurPrice, currency_code: "eur" as const },
        { amount: usdPrice, currency_code: "usd" as const },
      ],
    }));

  // Helper for color+size variants
  const colorSizeVariants = (
    prefix: string,
    colors: string[],
    eurPrice: number,
    usdPrice: number
  ) =>
    colors.flatMap((color) =>
      ["S", "M", "L", "XL"].map((size) => ({
        title: `${size} / ${color}`,
        sku: `${prefix}-${size}-${color.toUpperCase().replace(/\s/g, "")}`,
        options: { Size: size, Color: color },
        prices: [
          { amount: eurPrice, currency_code: "eur" as const },
          { amount: usdPrice, currency_code: "usd" as const },
        ],
      }))
    );

  const salesChannelLink = [{ id: defaultSalesChannel[0].id }];

  await createProductsWorkflow(container).run({
    input: {
      products: [
        // ── 1. Classic Cotton T-Shirt ──
        {
          title: "Classic Cotton T-Shirt",
          handle: "classic-cotton-tshirt",
          description:
            "A wardrobe essential crafted from 100% organic cotton. Soft, breathable, and designed for everyday comfort with a modern relaxed fit.",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: bestSellers.id,
          category_ids: [cat("T-Shirts")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["White", "Black", "Navy"] },
          ],
          variants: colorSizeVariants(
            "CTEE",
            ["White", "Black", "Navy"],
            25,
            29
          ),
          sales_channels: salesChannelLink,
        },

        // ── 2. Premium Hoodie ──
        {
          title: "Premium Zip Hoodie",
          handle: "premium-zip-hoodie",
          description:
            "Stay warm in style with our heavyweight fleece-lined hoodie. Features a full-length YKK zipper, kangaroo pocket, and ribbed cuffs for a snug fit.",
          weight: 600,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: newArrivals.id,
          category_ids: [cat("Hoodies & Sweatshirts")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1578768079470-9d1c39bf1abe?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["Charcoal", "Olive"] },
          ],
          variants: colorSizeVariants(
            "HOOD",
            ["Charcoal", "Olive"],
            65,
            75
          ),
          sales_channels: salesChannelLink,
        },

        // ── 3. Slim-Fit Chino Pants ──
        {
          title: "Slim-Fit Chino Pants",
          handle: "slim-fit-chinos",
          description:
            "Tailored slim-fit chinos made from stretch cotton twill. Perfect for the office or weekend — pair them with sneakers or dress shoes.",
          weight: 450,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: bestSellers.id,
          category_ids: [cat("Pants & Joggers")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["Khaki", "Navy", "Black"] },
          ],
          variants: colorSizeVariants(
            "CHNO",
            ["Khaki", "Navy", "Black"],
            49,
            55
          ),
          sales_channels: salesChannelLink,
        },

        // ── 4. Leather Weekend Bag ──
        {
          title: "Leather Weekend Bag",
          handle: "leather-weekend-bag",
          description:
            "Hand-stitched from full-grain vegetable-tanned leather. This spacious duffle features brass hardware, an adjustable strap, and a separate shoe compartment.",
          weight: 1200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: newArrivals.id,
          category_ids: [cat("Accessories")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
            },
          ],
          options: [{ title: "Size", values: ["S", "M", "L", "XL"] }],
          variants: sizeVariants("LBAG", 120, 139),
          sales_channels: salesChannelLink,
        },

        // ── 5. Linen Summer Shirt ──
        {
          title: "Linen Summer Shirt",
          handle: "linen-summer-shirt",
          description:
            "Lightweight pure linen shirt with a relaxed collar. Ideal for warm-weather days — breathable, naturally textured, and effortlessly elegant.",
          weight: 180,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: summerEssentials.id,
          category_ids: [cat("T-Shirts")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["White", "Sky Blue"] },
          ],
          variants: colorSizeVariants(
            "LNSH",
            ["White", "Sky Blue"],
            45,
            52
          ),
          sales_channels: salesChannelLink,
        },

        // ── 6. Running Joggers ──
        {
          title: "Performance Running Joggers",
          handle: "running-joggers",
          description:
            "Engineered for movement with 4-way stretch fabric, zippered pockets, and moisture-wicking technology. From track to street in style.",
          weight: 300,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: bestSellers.id,
          category_ids: [cat("Pants & Joggers")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["Black", "Grey"] },
          ],
          variants: colorSizeVariants("JOGG", ["Black", "Grey"], 42, 48),
          sales_channels: salesChannelLink,
        },

        // ── 7. Canvas Sneakers ──
        {
          title: "Canvas Low-Top Sneakers",
          handle: "canvas-sneakers",
          description:
            "Timeless low-top sneakers with vulcanized rubber sole, organic cotton upper, and cushioned insole. The everyday shoe you'll reach for first.",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: summerEssentials.id,
          category_ids: [cat("Accessories")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80",
            },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
            { title: "Color", values: ["White", "Black"] },
          ],
          variants: colorSizeVariants("SNKR", ["White", "Black"], 55, 65),
          sales_channels: salesChannelLink,
        },

        // ── 8. Denim Jacket ──
        {
          title: "Washed Denim Jacket",
          handle: "denim-jacket",
          description:
            "A timeless denim jacket with a vintage wash, copper-toned buttons, and adjustable waist tabs. Layer it over anything for instant street style.",
          weight: 700,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: newArrivals.id,
          category_ids: [cat("Jackets & Outerwear")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80",
            },
          ],
          options: [{ title: "Size", values: ["S", "M", "L", "XL"] }],
          variants: sizeVariants("DNJK", 89, 99),
          sales_channels: salesChannelLink,
        },

        // ── 9. Midi Wrap Dress ──
        {
          title: "Floral Midi Wrap Dress",
          handle: "midi-wrap-dress",
          description:
            "A flattering wrap silhouette in a delicate floral print. Made from flowing viscose with an adjustable waist tie — effortlessly feminine.",
          weight: 250,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: summerEssentials.id,
          category_ids: [cat("Dresses & Skirts")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
            },
          ],
          options: [{ title: "Size", values: ["S", "M", "L", "XL"] }],
          variants: sizeVariants("DRSS", 59, 69),
          sales_channels: salesChannelLink,
        },

        // ── 10. Minimalist Watch ──
        {
          title: "Minimalist Analog Watch",
          handle: "minimalist-watch",
          description:
            "Clean dial, sapphire crystal glass, and a genuine Italian leather strap. Japanese quartz movement with 50m water resistance.",
          weight: 80,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          collection_id: bestSellers.id,
          category_ids: [cat("Accessories")],
          images: [
            {
              url: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800&q=80",
            },
            {
              url: "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=800&q=80",
            },
          ],
          options: [{ title: "Size", values: ["S", "M", "L", "XL"] }],
          variants: sizeVariants("WTCH", 95, 110),
          sales_channels: salesChannelLink,
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 1000000,
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
}
