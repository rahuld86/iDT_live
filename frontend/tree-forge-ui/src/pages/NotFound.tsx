import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <Card className="shadow-card border-0 max-w-md w-full animate-fade-in">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl font-bold text-destructive">404</span>
          </div>
          <CardTitle className="text-2xl font-semibold text-foreground">
            Page Not Found
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Requested path: <code className="bg-accent px-2 py-1 rounded text-xs">{location.pathname}</code>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={() => navigate(-1)}
              variant="outline"
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button 
              onClick={() => navigate("/")}
              className="flex-1 bg-gradient-primary hover:shadow-elegant transition-all duration-300"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
