CREATE OR REPLACE FUNCTION get_business_activity_counts(p_business_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'connection_count', (
      SELECT count(*)::int
      FROM connections
      WHERE buyer_business_id = p_business_id
         OR supplier_business_id = p_business_id
    ),
    'order_count', (
      SELECT count(*)::int
      FROM orders o
      JOIN connections c ON o.connection_id = c.id
      WHERE c.buyer_business_id = p_business_id
         OR c.supplier_business_id = p_business_id
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_business_activity_counts(uuid) TO authenticated;
