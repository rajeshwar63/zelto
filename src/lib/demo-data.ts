import { dataStore } from './data-store'
import { createConnection, createOrder, transitionOrderState, recordPayment } from './interactions'

const DEMO_DATA_INITIALIZED_KEY = 'zelto:demo-data-initialized'

export async function initializeDemoData(): Promise<string> {
  const initialized = await spark.kv.get<boolean>(DEMO_DATA_INITIALIZED_KEY)
  
  if (initialized) {
    const entities = await dataStore.getAllBusinessEntities()
    if (entities.length > 0) {
      return entities[0].id
    }
  }

  const mehfilRestaurant = await dataStore.createBusinessEntity('Mehfil Restaurant')
  const freshFoodsSupply = await dataStore.createBusinessEntity('Fresh Foods Supply')

  const connection = await createConnection(
    mehfilRestaurant.id,
    freshFoodsSupply.id,
    { type: 'Payment on Delivery' }
  )

  const order1 = await createOrder(
    connection.id,
    '50kg Basmati Rice',
    12500,
    mehfilRestaurant.id
  )
  await transitionOrderState(order1.id, 'Accepted', freshFoodsSupply.id)
  await transitionOrderState(order1.id, 'Dispatched', freshFoodsSupply.id)
  await transitionOrderState(order1.id, 'Delivered', freshFoodsSupply.id)

  const order2 = await createOrder(
    connection.id,
    '30kg Chickpeas',
    8200,
    mehfilRestaurant.id
  )

  const order3 = await createOrder(
    connection.id,
    '20 Litres Mustard Oil',
    6000,
    mehfilRestaurant.id
  )
  await transitionOrderState(order3.id, 'Accepted', freshFoodsSupply.id)
  await transitionOrderState(order3.id, 'Dispatched', freshFoodsSupply.id)
  await transitionOrderState(order3.id, 'Delivered', freshFoodsSupply.id)
  await recordPayment(order3.id, 2500, mehfilRestaurant.id)

  await spark.kv.set(DEMO_DATA_INITIALIZED_KEY, true)
  
  return mehfilRestaurant.id
}
