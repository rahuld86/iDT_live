# Nginx server_name Configuration Guide

## Understanding server_name

The `server_name` directive in nginx tells it which requests should be handled by this server block.

## Options for EC2 Deployment

### Option 1: `server_name _;` with `default_server` (Recommended for EC2)

```nginx
server {
    listen 80 default_server;
    server_name _;  # Catch-all: accepts any domain/IP
    ...
}
```

**Pros:**
- ✅ Works with any IP address (EC2 public IP can change)
- ✅ Works without a domain name
- ✅ Simple and flexible

**Cons:**
- ⚠️ May conflict if you have multiple server blocks (nginx picks the first match)

**Best for:** EC2 instances without a domain, where IP may change

**Note:** Use `default_server` with `listen` to explicitly mark this as the default server and avoid conflicts.

### Option 2: Specific IP Address

```nginx
server {
    listen 80;
    server_name 3.111.55.162;  # Your current EC2 public IP
    ...
}
```

**Pros:**
- ✅ Explicit and clear
- ✅ Better for security (only responds to specific IP)

**Cons:**
- ❌ Must update when EC2 IP changes
- ❌ Won't work if you get a new public IP after reboot

**Best for:** Static IP or Elastic IP

### Option 3: Default Server

```nginx
server {
    listen 80 default_server;
    # No server_name needed
    ...
}
```

**Pros:**
- ✅ Explicitly marks as default server
- ✅ Won't conflict with other server blocks

**Cons:**
- ⚠️ `default_server` is needed if multiple server blocks exist

**Best for:** When you have multiple server blocks

### Option 4: Elastic IP (Best Long-term Solution)

If you want a stable IP:

```bash
# Allocate Elastic IP in AWS Console
# Associate it with your EC2 instance
# Then use:
```

```nginx
server {
    listen 80;
    server_name YOUR_ELASTIC_IP;  # e.g., 54.123.45.67
    ...
}
```

**Pros:**
- ✅ IP never changes
- ✅ Can use specific server_name
- ✅ Professional solution

**Cons:**
- ⚠️ Small cost if not attached to running instance
- ⚠️ Requires AWS setup

## Your Current Setup

Using `server_name _;` is **correct and appropriate** for your use case because:

1. ✅ Your EC2 public IP changes on reboot
2. ✅ You don't have a domain name
3. ✅ It's a catch-all that works with any IP
4. ✅ Common practice for development/testing setups

## Recommendations

### For Production with Domain

If you get a domain later:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    ...
}
```

### For Production without Domain (Current)

Keep using `server_name _;` - it's perfect for your needs.

### Recommended Configuration

For best results, use `default_server` with `server_name _;`:

```nginx
server {
    listen 80 default_server;
    server_name _;
    ...
}
```

This explicitly marks it as the default server, avoids conflicts with other server blocks, and makes it clear it's a catch-all.

## Security Note

Using `_` (catch-all) means nginx will respond to:
- Your EC2 IP
- Your EC2 hostname
- Any domain that points to your IP
- Direct IP access

This is fine for most use cases, but if you need stricter control, use a specific IP or domain.

## Conclusion

**Your current configuration with `server_name _;` is correct and appropriate** for an EC2 deployment without a domain where the IP may change. No changes needed!

