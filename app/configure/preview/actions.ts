"use server";
import { BASE_PRICE, PRODUCT_PRICES } from "@/config/products";
import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

export const createCheckoutSession = async ({
  configId,
}: {
  configId: string;
}) => {
  if (!configId) {
    throw new Error("Config ID is required");
  }

  const configuration = await db.configuration.findUnique({
    where: { id: configId },
  });

  if (!configuration) {
    throw new Error("No such configuration found");
  }

  if (!configuration.imageUrl) {
    throw new Error("Product image URL is missing");
  }

  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user) {
    throw new Error("You need to be logged in");
  }

  let price = BASE_PRICE;
  if (configuration.finish === "textured")
    price += PRODUCT_PRICES.finish.textured;
  if (configuration.material === "polycarbonate")
    price += PRODUCT_PRICES.material.polycarbonate;

  let order = await db.order.findFirst({
    where: { userId: user.id, configurationId: configuration.id },
  });

  if (!order) {
    order = await db.order.create({
      data: {
        amount: price / 100,
        userId: user.id,
        configurationId: configuration.id,
      },
    });
  }

  const product = await stripe.products.create({
    name: "Custom iPhone Case",
    images: [configuration.imageUrl],
    default_price_data: {
      currency: "USD",
      unit_amount: price,
    },
  });

  if (!product.default_price) {
    throw new Error("Stripe product price is missing");
  }

  const successUrl = process.env.NEXT_PUBLIC_SERVER_URL
    ? `${process.env.NEXT_PUBLIC_SERVER_URL}/thank-you?orderId=${order.id}`
    : "http://localhost:3000/thank-you";

  const cancelUrl = process.env.NEXT_PUBLIC_SERVER_URL
    ? `${process.env.NEXT_PUBLIC_SERVER_URL}/configure/preview?id=${configuration.id}`
    : "http://localhost:3000/configure/preview";

  const stripeSession = await stripe.checkout.sessions.create({
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card", "paypal"],
    mode: "payment",
    shipping_address_collection: { allowed_countries: ["DE", "US"] },
    metadata: { userId: user.id, orderId: order.id },
    line_items: [{ price: product.default_price as string, quantity: 1 }],
  });

  return { url: stripeSession.url };
};
