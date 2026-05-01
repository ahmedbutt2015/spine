<?php

namespace App\Http;

use App\Controllers\HomeController;

class Router
{
    public function dispatch(): void
    {
        (new HomeController())->index();
    }
}
